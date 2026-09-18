import { defineStore } from 'pinia'
import { PerfMetricsSample } from '../types'

export const usePerfStore = defineStore('perf', {
  state: () => ({
    history: [] as PerfMetricsSample[],
    maxHistoryLength: 60,
    currentSample: null as PerfMetricsSample | null,
    isMonitoring: false,
    unsubscribe: null as (() => void) | null,
    currentSerial: null as string | null
  }),

  actions: {
    startMonitoring(serial: string, pkg: string | null): void {
      if (!window.electronAPI) return
      this.stopMonitoring()
      this.currentSerial = serial
      this.isMonitoring = true
      this.history = []
      this.currentSample = null

      window.electronAPI.startPerf(serial, pkg)

      this.unsubscribe = window.electronAPI.onPerfSample((sample) => {
        this.currentSample = sample
        this.history.push(sample)
        if (this.history.length > this.maxHistoryLength) {
          this.history.shift()
        }
      })
    },

    stopMonitoring(): void {
      if (this.unsubscribe) {
        this.unsubscribe()
        this.unsubscribe = null
      }
      if (window.electronAPI) {
        window.electronAPI.stopPerf()
      }
      this.isMonitoring = false
      this.currentSerial = null
    },

    clearHistory(): void {
      this.history = []
      this.currentSample = null
    },

    async exportCsv(): Promise<boolean> {
      if (!window.electronAPI || this.history.length === 0) return false
      const defaultName = `perf_report_${Date.now()}.csv`
      const filePath = await window.electronAPI.showSaveDialog(defaultName)
      if (!filePath) return false

      const headers = [
        'Timestamp',
        'App CPU(%)',
        'System CPU(%)',
        'Total PSS(KB)',
        'Java Heap(KB)',
        'Native Heap(KB)',
        'Graphics(KB)',
        'Private Dirty(KB)',
        'Network Rx(B/s)',
        'Network Tx(B/s)',
        'Battery(%)',
        'Temperature(C)'
      ]

      const rows = this.history.map(s => [
        new Date(s.timestamp).toLocaleTimeString(),
        s.cpu.appPercent,
        s.cpu.systemPercent,
        s.memory.totalPss,
        s.memory.javaHeapPss,
        s.memory.nativeHeapPss,
        s.memory.graphicsPss,
        s.memory.privateDirty,
        s.network.rxBytesPerSec,
        s.network.txBytesPerSec,
        s.battery.level,
        s.battery.temperature
      ])

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      await window.electronAPI.writeTextFile(filePath, csvContent)
      return true
    }
  }
})
