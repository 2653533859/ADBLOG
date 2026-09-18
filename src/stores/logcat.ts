import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { LogcatEntry, LogcatFilterOptions, LogLevel } from '../types'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  V: 1,
  D: 2,
  I: 3,
  W: 4,
  E: 5,
  A: 6
}

export const useLogcatStore = defineStore('logcat', {
  state: () => ({
    entries: [] as LogcatEntry[],
    maxDisplayEntries: 15000,
    filter: {
      targetPid: null,
      minLevel: 'V',
      keyword: '',
      isRegex: false,
      isCaseSensitive: false,
      tag: '',
      excludeTags: []
    } as LogcatFilterOptions,
    autoScroll: true,
    isPaused: false,
    isRecording: false,
    recordingError: '',
    unsubscribeRecording: null as (() => void) | null,
    recordingPath: null as string | null,
    logRate: 0,
    currentSerial: null as string | null,
    unsubscribe: null as (() => void) | null,
    rateCounter: 0,
    rateInterval: null as NodeJS.Timeout | null
  }),

  getters: {
    filteredEntries: (state): LogcatEntry[] => {
      let regex: RegExp | null = null
      if (state.filter.keyword && state.filter.isRegex) {
        try {
          regex = new RegExp(state.filter.keyword, state.filter.isCaseSensitive ? '' : 'i')
        } catch {
          regex = null
        }
      }

      const minWeight = LEVEL_WEIGHT[state.filter.minLevel] || 1
      const tagLower = state.filter.tag.toLowerCase()
      const kwLower = state.filter.keyword.toLowerCase()

      return state.entries.filter(entry => {
        if (state.filter.targetPid !== null && entry.pid !== state.filter.targetPid) {
          return false
        }
        if (LEVEL_WEIGHT[entry.level] < minWeight) {
          return false
        }
        if (tagLower && !entry.tag.toLowerCase().includes(tagLower)) {
          return false
        }
        if (state.filter.excludeTags.length > 0) {
          for (const ex of state.filter.excludeTags) {
            if (entry.tag.includes(ex)) return false
          }
        }
        if (state.filter.keyword) {
          if (regex) {
            return regex.test(entry.message) || regex.test(entry.tag)
          }
          if (state.filter.isCaseSensitive) {
            return entry.message.includes(state.filter.keyword) || entry.tag.includes(state.filter.keyword)
          }
          return entry.message.toLowerCase().includes(kwLower) || entry.tag.toLowerCase().includes(kwLower)
        }
        return true
      })
    }
  },

  actions: {
    startStream(serial: string): void {
      if (!window.electronAPI) return
      this.stopStream()
      this.unsubscribeRecording = window.electronAPI.onRecordingError((message) => {
        this.isRecording = false
        this.recordingPath = null
        this.recordingError = message
        window.alert(`Log recording failed: ${message}`)
      })
      this.currentSerial = serial
      this.entries = []
      this.rateCounter = 0
      this.logRate = 0

      window.electronAPI.startLogcat(serial)

      this.unsubscribe = window.electronAPI.onLogcatBatch((newEntries) => {
        this.rateCounter += newEntries.length
        if (!this.isPaused) {
          // Log entries are immutable. Avoid creating thousands of deep Vue
          // proxies per second when only the array itself needs to be reactive.
          this.entries.push(...newEntries.map(entry => markRaw(entry)))
          if (this.entries.length > this.maxDisplayEntries) {
            this.entries.splice(0, this.entries.length - this.maxDisplayEntries)
          }
        }
      })

      this.rateInterval = setInterval(() => {
        this.logRate = this.rateCounter
        this.rateCounter = 0
      }, 1000)
    },

    stopStream(): void {
      this.unsubscribeRecording?.()
      this.unsubscribeRecording = null
      if (this.unsubscribe) {
        this.unsubscribe()
        this.unsubscribe = null
      }
      if (this.rateInterval) {
        clearInterval(this.rateInterval)
        this.rateInterval = null
      }
      if (window.electronAPI) {
        window.electronAPI.stopLogcat()
      }
      this.isRecording = false
      this.recordingPath = null
      this.currentSerial = null
      this.logRate = 0
    },

    async clear(): Promise<void> {
      this.entries = []
      if (window.electronAPI && this.currentSerial) {
        await window.electronAPI.clearLogcat(this.currentSerial)
      }
    },

    togglePause(): void {
      this.isPaused = !this.isPaused
    },

    toggleAutoScroll(): void {
      this.autoScroll = !this.autoScroll
    },

    async toggleRecording(): Promise<boolean> {
      if (!window.electronAPI) return false

      if (this.isRecording) {
        await window.electronAPI.stopRecordingLogcat()
        this.isRecording = false
        this.recordingPath = null
        return false
      }

      const defaultName = `logcat_${Date.now()}.log`
      const filePath = await window.electronAPI.showSaveDialog(defaultName)
      if (!filePath) return false

      const serial = this.currentSerial
      const ok = await window.electronAPI.startRecordingLogcat(filePath)
      if (ok && serial === this.currentSerial && serial) {
        this.isRecording = true
        this.recordingPath = filePath
      }
      return ok
    },

    setTargetPid(pid: number | null): void {
      this.filter.targetPid = pid
    },

    setMinLevel(level: LogLevel): void {
      this.filter.minLevel = level
    }
  }
})
