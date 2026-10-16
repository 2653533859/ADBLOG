import { defineStore } from 'pinia'
import type { TimelineEvent } from '../types'

export const useTimelineStore = defineStore('timeline', {
  state: () => ({ events: [] as TimelineEvent[] }),
  actions: {
    add(event: Omit<TimelineEvent, 'id'>): void {
      this.events.unshift({ ...event, id: crypto.randomUUID() })
      if (this.events.length > 500) this.events.splice(500)
    },
    toggleBookmark(serial: string, logId: number, at: number, title: string): void {
      const index = this.events.findIndex(event => event.serial === serial &&
        event.kind === 'bookmark' && event.logId === logId)
      if (index >= 0) this.events.splice(index, 1)
      else this.add({ serial, kind: 'bookmark', logId, at, title })
    },
    forDevice(serial: string): TimelineEvent[] {
      return this.events.filter(event => event.serial === serial)
    },
    clearLiveBookmarks(serial: string): void {
      this.events = this.events.filter(event => event.serial !== serial || event.kind !== 'bookmark')
    }
  }
})
