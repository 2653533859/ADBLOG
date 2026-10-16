import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { LogcatEntry, LogcatFilterOptions, LogLevel } from '../types'
import { filterLogcatEntries } from '../utils/logcat-filter'
import { useIncidentStore } from './incidents'
import { useTimelineStore } from './timeline'
import { useCaptureRulesStore } from './capture-rules'

// The main process owns one logcat stream. Keep its stop/start IPC calls in
// order even when the selected device changes while a call is still pending.
let streamCommand: Promise<void> = Promise.resolve()

function queueStreamCommand(command: () => Promise<void>): Promise<void> {
  const current = streamCommand.then(command)
  streamCommand = current.catch(() => undefined)
  return current
}

export const useLogcatStore = defineStore('logcat', {
  state: () => ({
    entries: [] as LogcatEntry[],
    maxDisplayEntries: 15000,
    filter: {
      targetPids: null,
      pid: null,
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
    rateInterval: null as NodeJS.Timeout | null,
    streamGeneration: 0
  }),

  getters: {
    filterResult: (state) => filterLogcatEntries(state.entries, state.filter),
    filteredEntries(): LogcatEntry[] { return this.filterResult.entries },
    scopeCount(): number { return this.filterResult.scopeCount }
  },

  actions: {
    async startStream(serial: string): Promise<void> {
      if (!window.electronAPI) return
      const generation = ++this.streamGeneration
      this.cleanupRendererStream()
      await queueStreamCommand(async () => {
        await window.electronAPI.stopLogcat()
        if (generation !== this.streamGeneration) return
        this.currentSerial = serial
        useTimelineStore().clearLiveBookmarks(serial)
        this.entries = []
        this.rateCounter = 0
        this.logRate = 0
        this.unsubscribeRecording = window.electronAPI.onRecordingError((message) => {
          if (generation !== this.streamGeneration) return
          this.isRecording = false
          this.recordingPath = null
          this.recordingError = message
          window.alert(`Log recording failed: ${message}`)
        })
        // Subscribe before starting: the main process can send its first batch
        // before the start IPC reply reaches the renderer.
        this.unsubscribe = window.electronAPI.onLogcatBatch((newEntries) => {
          if (generation !== this.streamGeneration) return
          const incidents = useIncidentStore().ingest(serial, newEntries)
          void useCaptureRulesStore().handleBatch(serial, newEntries, incidents)
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
          if (generation !== this.streamGeneration) return
          this.logRate = this.rateCounter
          this.rateCounter = 0
        }, 1000)
        try {
          await window.electronAPI.startLogcat(serial)
        } catch (error) {
          if (generation === this.streamGeneration) this.cleanupRendererStream()
          throw error
        }
      })
    },

    cleanupRendererStream(): void {
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
      this.isRecording = false
      this.recordingPath = null
      this.currentSerial = null
      this.logRate = 0
    },

    async stopStream(): Promise<void> {
      ++this.streamGeneration
      this.cleanupRendererStream()
      if (window.electronAPI) {
        await queueStreamCommand(() => window.electronAPI.stopLogcat())
      }
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

    setTargetPids(pids: number[] | null): void {
      this.filter.targetPids = pids
    },

    retainTargetPids(pids: number[]): void {
      if (this.filter.targetPids === null || pids.length === 0) return
      this.filter.targetPids = [...new Set([...this.filter.targetPids, ...pids])]
    },

    setMinLevel(level: LogLevel): void {
      this.filter.minLevel = level
    },

    clearDisplayFilters(): void {
      this.filter.minLevel = 'V'
      this.filter.keyword = ''
      this.filter.isRegex = false
      this.filter.isCaseSensitive = false
      this.filter.tag = ''
      this.filter.excludeTags = []
      this.filter.pid = null
    }
  }
})
