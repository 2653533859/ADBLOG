import { defineStore } from 'pinia'
import type { LogcatEntry } from '../types'

export const useDeviceWorkspacesStore = defineStore('device-workspaces', {
  state: () => ({ logSnapshots: {} as Record<string, LogcatEntry[]> }),
  actions: {
    saveLogs(serial: string, entries: LogcatEntry[]): void {
      this.logSnapshots[serial] = entries.slice(-1000).map(entry => ({ ...entry }))
    },
    logsFor(serial: string): LogcatEntry[] { return this.logSnapshots[serial] || [] }
  }
})
