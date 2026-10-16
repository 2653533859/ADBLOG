import { defineStore } from 'pinia'
import type { IncidentEvent, LogcatEntry } from '../types'
import { usePerfStore } from './perf'
import { useTimelineStore } from './timeline'

interface CaptureResult { at: number; serial: string; reason: string; path: string; error?: string }
const KEY = 'adblog.capture-rules.v1'
function saved(): { folder: string; onIncident: boolean; keyword: string; cooldownSeconds: number; enabled: boolean } {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      folder: typeof value.folder === 'string' ? value.folder : '',
      onIncident: value.onIncident !== false,
      keyword: typeof value.keyword === 'string' ? value.keyword : '',
      cooldownSeconds: Number.isFinite(value.cooldownSeconds) ? Math.max(10, value.cooldownSeconds) : 60,
      enabled: value.enabled === true
    }
  } catch { return { folder: '', onIncident: true, keyword: '', cooldownSeconds: 60, enabled: false } }
}

export const useCaptureRulesStore = defineStore('capture-rules', {
  state: () => ({ ...saved(), busy: false, lastCaptureAt: {} as Record<string, number>,
    lastFailureAt: {} as Record<string, number>, results: [] as CaptureResult[] }),
  actions: {
    persist(): void {
      localStorage.setItem(KEY, JSON.stringify({ folder: this.folder, onIncident: this.onIncident,
        keyword: this.keyword, cooldownSeconds: this.cooldownSeconds, enabled: this.enabled }))
    },
    async handleBatch(serial: string, entries: LogcatEntry[], incidents: IncidentEvent[]): Promise<void> {
      if (!this.enabled || !this.folder || this.busy) return
      const keyword = this.keyword.trim().toLowerCase()
      const incident = this.onIncident ? incidents[0] : undefined
      const match = keyword ? entries.find(entry => entry.raw.toLowerCase().includes(keyword)) : undefined
      const reason = incident ? incident.title : match ? `关键字：${this.keyword}` : ''
      if (!reason || Date.now() - (this.lastCaptureAt[serial] || 0) < this.cooldownSeconds * 1000 ||
        Date.now() - (this.lastFailureAt[serial] || 0) < 5000) return
      this.busy = true
      const destination = `${this.folder.replace(/[\\/]$/, '')}\\ADBlog-auto-${Date.now()}.zip`
      try {
        const result = await window.electronAPI.createDiagnosticBundle({ serial, destination,
          lastMinutes: 5, includeBugreport: false, perfSamples: usePerfStore().getHistoryForDevice(serial) })
        this.lastCaptureAt[serial] = Date.now()
        this.results.unshift({ at: Date.now(), serial, reason, path: result.path })
        useTimelineStore().add({ serial, at: Date.now(), kind: 'note', title: '自动诊断包已保存', detail: `${reason}\n${result.path}` })
      } catch (error) {
        this.lastFailureAt[serial] = Date.now()
        this.results.unshift({ at: Date.now(), serial, reason, path: destination,
          error: error instanceof Error ? error.message : String(error) })
      } finally {
        this.results.splice(20)
        this.busy = false
      }
    }
  }
})
