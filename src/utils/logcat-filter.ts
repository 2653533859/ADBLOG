import type { LogcatEntry, LogcatFilterOptions, LogLevel } from '../types'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  V: 1, D: 2, I: 3, W: 4, E: 5, A: 6
}

export interface LogcatFilterResult {
  entries: LogcatEntry[]
  scopeCount: number
}

export function filterLogcatEntries(entries: LogcatEntry[], filter: LogcatFilterOptions): LogcatFilterResult {
  const targetPids = filter.targetPids === null ? null : new Set(filter.targetPids)
  const minWeight = LEVEL_WEIGHT[filter.minLevel] || 1
  const tagQuery = filter.tag.toLowerCase()
  const excludedTags = filter.excludeTags.map(tag => tag.toLowerCase()).filter(Boolean)
  const keyword = filter.isCaseSensitive ? filter.keyword : filter.keyword.toLowerCase()
  let regex: RegExp | null = null
  let invalidRegex = false

  if (filter.keyword && filter.isRegex) {
    try {
      regex = new RegExp(filter.keyword, filter.isCaseSensitive ? '' : 'i')
    } catch {
      invalidRegex = true
    }
  }

  const matched: LogcatEntry[] = []
  let scopeCount = 0
  for (const entry of entries) {
    if (targetPids !== null && !targetPids.has(entry.pid)) continue
    scopeCount += 1
    if (filter.pid != null && entry.pid !== filter.pid) continue
    if (LEVEL_WEIGHT[entry.level] < minWeight) continue

    const tagLower = entry.tag.toLowerCase()
    if (tagQuery && !tagLower.includes(tagQuery)) continue
    if (excludedTags.some(tag => tagLower.includes(tag))) continue
    if (filter.keyword) {
      if (invalidRegex) continue
      if (regex) {
        if (!regex.test(entry.message) && !regex.test(entry.tag)) continue
      } else if (filter.isCaseSensitive) {
        if (!entry.message.includes(keyword) && !entry.tag.includes(keyword)) continue
      } else if (!entry.message.toLowerCase().includes(keyword) && !tagLower.includes(keyword)) {
        continue
      }
    }
    matched.push(entry)
  }
  return { entries: matched, scopeCount }
}
