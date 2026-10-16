import { defineStore } from 'pinia'
import type { IncidentEvent, LogcatEntry } from '../types'
import { classifyIncident, exceptionSignature } from '../utils/incident-detection'

export const useIncidentStore = defineStore('incidents', {
  state: () => ({ events: [] as IncidentEvent[] }),
  actions: {
    ingest(serial: string, entries: LogcatEntry[]): IncidentEvent[] {
      const created: IncidentEvent[] = []
      for (const entry of entries) {
        const incident = classifyIncident(serial, entry)
        if (incident && !this.events.some(event => event.id === incident.id)) {
          this.events.unshift(incident)
          created.push(incident)
        } else {
          const open = this.events.find(event => event.serial === serial &&
            event.kind === 'crash' && event.pid === entry.pid &&
            entry.id > event.logId && entry.id <= event.logId + 18)
          if (open && open.excerpt.length < 18) {
            open.excerpt.push(entry.raw)
            const signature = exceptionSignature(entry.message)
            if (signature && open.signature === 'Java crash') open.signature = signature
          }
        }
      }
      if (this.events.length > 300) this.events.splice(300)
      return created
    },
    forDevice(serial: string): IncidentEvent[] {
      return this.events.filter(event => event.serial === serial)
    }
  }
})
