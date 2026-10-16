import type { IncidentEvent, LogcatEntry } from '../types'

export function logTimestampToEpoch(timestamp: string, now = Date.now()): number {
  const match = /^(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(timestamp)
  if (!match) return now
  const current = new Date(now)
  const value = new Date(current.getFullYear(), Number(match[1]) - 1, Number(match[2]),
    Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])).getTime()
  return value > now + 24 * 60 * 60_000
    ? new Date(current.getFullYear() - 1, Number(match[1]) - 1, Number(match[2]),
      Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])).getTime()
    : value
}

export function classifyIncident(serial: string, entry: LogcatEntry): IncidentEvent | null {
  const message = entry.message.trim()
  let kind: IncidentEvent['kind']
  let signature: string
  if (/\bFATAL EXCEPTION\b/.test(message) && entry.tag === 'AndroidRuntime') {
    kind = 'crash'; signature = 'Java crash'
  } else if (/\bANR in\s+\S+/.test(message)) {
    kind = 'anr'; signature = message.match(/\bANR in\s+\S+/)?.[0] || 'ANR'
  } else if (/\bFatal signal\s+\d+/.test(message)) {
    kind = 'native-crash'; signature = message.match(/\bFatal signal\s+\d+/)?.[0] || 'Native crash'
  } else return null
  return {
    id: `${serial}:${entry.id}:${entry.timestamp}`,
    serial, kind, occurredAt: logTimestampToEpoch(entry.timestamp),
    logId: entry.id, pid: entry.pid, title: message.slice(0, 160),
    signature, excerpt: [entry.raw]
  }
}

export function exceptionSignature(message: string): string | null {
  const match = /(?:Caused by:\s*)?([\w.$]+(?:Exception|Error))(?::\s*([^\n]+))?/.exec(message)
  return match ? `${match[1]}${match[2] ? `: ${match[2].slice(0, 120)}` : ''}` : null
}
