<template>
  <div class="flex-1 overflow-hidden bg-dark-900 p-5 flex flex-col gap-4 text-gray-200">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-lg font-semibold">日志会话</h1>
        <p class="text-xs text-gray-500">打开保存的会话，查看关键标记并比较两次采集。</p>
      </div>
      <div class="flex gap-2 text-xs">
        <button @click="openSession('a')" class="rounded border border-dark-700 bg-dark-800 px-3 py-2 hover:text-white">打开会话 A</button>
        <button @click="openSession('b')" class="rounded border border-dark-700 bg-dark-800 px-3 py-2 hover:text-white">打开会话 B</button>
      </div>
    </div>

    <div v-if="errorMessage" class="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{{ errorMessage }}</div>
    <div class="grid grid-cols-2 gap-3">
      <button v-for="slot in slots" :key="slot.key" @click="activeSlot = slot.key"
        class="rounded-lg border p-3 text-left text-xs" :class="activeSlot === slot.key ? 'border-brand bg-brand/10' : 'border-dark-700 bg-dark-850'">
        <div class="font-semibold">会话 {{ slot.key.toUpperCase() }}</div>
        <div v-if="slot.session" class="mt-2 space-y-1 text-gray-400">
          <div>{{ slot.session.serial }} · {{ new Date(slot.session.savedAt).toLocaleString() }}</div>
          <div>日志 {{ slot.session.entries.length }} 条 · 错误 {{ errorCount(slot.session) }} 条 · 标记 {{ slot.session.bookmarkedIds.length }} 条</div>
          <div>筛选：{{ slot.session.selectedPackage || '全部进程' }} / {{ slot.session.filter.minLevel }} 及以上</div>
        </div>
        <div v-else class="mt-2 text-gray-500">尚未打开</div>
      </button>
    </div>

    <div v-if="sessionA && sessionB" class="rounded border border-dark-700 bg-dark-850 p-3 text-xs text-gray-300">
      对照：B 比 A 多 {{ sessionB.entries.length - sessionA.entries.length }} 条日志、{{ errorCount(sessionB) - errorCount(sessionA) }} 条错误；可切换上方会话查看具体内容。
    </div>
    <div v-if="activeSession && (activeSession.timelineEvents?.length || activeSession.incidents?.length)" class="rounded border border-dark-700 bg-dark-850 p-3 text-xs">
      <div class="font-semibold mb-2">保存的关联事件 · {{ (activeSession.timelineEvents?.length || 0) + (activeSession.incidents?.length || 0) }} 条</div>
      <div class="max-h-24 overflow-auto space-y-1 text-gray-400"><div v-for="event in sessionEvents" :key="event.id">{{ new Date(event.at).toLocaleString() }} · {{ event.title }}</div></div>
      <div class="mt-2 text-gray-500">性能采样 {{ activeSession.performanceSamples?.length || 0 }} 条</div>
    </div>

    <div v-if="activeSession" class="min-h-0 flex-1 flex flex-col gap-2">
      <div class="flex items-center gap-4 text-xs">
        <input v-model="query" placeholder="在已保存日志中搜索" class="flex-1 rounded border border-dark-700 bg-dark-850 px-3 py-2 focus:outline-none focus:border-brand" />
        <label class="flex items-center gap-2"><input v-model="bookmarksOnly" type="checkbox" class="accent-emerald-500" />仅看标记</label>
        <span class="text-gray-500">匹配 {{ visibleLogs.length }} 条，显示前 500 条</span>
      </div>
      <div class="min-h-0 flex-1 overflow-auto rounded border border-dark-700 bg-dark-850 font-mono text-[11px]">
        <div v-for="entry in visibleLogs.slice(0, 500)" :key="entry.id" class="flex gap-2 border-b border-dark-800 px-3 py-1.5">
          <span class="w-4 shrink-0 text-amber-400">{{ activeSession.bookmarkedIds.includes(entry.id) ? '★' : '' }}</span>
          <span class="w-36 shrink-0 text-gray-500">{{ entry.timestamp }}</span>
          <span class="w-6 shrink-0 font-bold" :class="entry.level === 'E' || entry.level === 'A' ? 'text-red-400' : 'text-gray-400'">{{ entry.level }}</span>
          <span class="w-32 shrink-0 truncate text-brand">{{ entry.tag }}</span>
          <span class="whitespace-pre-wrap break-all text-gray-300">{{ entry.message }}</span>
        </div>
      </div>
    </div>
    <div v-else class="flex-1 flex items-center justify-center text-sm text-gray-500">打开一个会话开始查看</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { LogSession } from '../types'

const sessionA = ref<LogSession | null>(null)
const sessionB = ref<LogSession | null>(null)
const activeSlot = ref<'a' | 'b'>('a')
const query = ref('')
const bookmarksOnly = ref(false)
const errorMessage = ref('')
const slots = computed(() => [{ key: 'a' as const, session: sessionA.value }, { key: 'b' as const, session: sessionB.value }])
const activeSession = computed(() => activeSlot.value === 'a' ? sessionA.value : sessionB.value)
const sessionEvents = computed(() => {
  const session = activeSession.value
  if (!session) return []
  return [...(session.timelineEvents || []), ...(session.incidents || []).map(event => ({ id: event.id, at: event.occurredAt, title: event.title }))].sort((a, b) => b.at - a.at)
})
const visibleLogs = computed(() => {
  const session = activeSession.value
  if (!session) return []
  const needle = query.value.trim().toLowerCase()
  return session.entries.filter(entry => {
    if (bookmarksOnly.value && !session.bookmarkedIds.includes(entry.id)) return false
    return !needle || entry.raw.toLowerCase().includes(needle)
  })
})

function errorCount(session: LogSession): number {
  return session.entries.filter(entry => entry.level === 'E' || entry.level === 'A').length
}

async function openSession(slot: 'a' | 'b'): Promise<void> {
  const filename = await window.electronAPI.showOpenDialogFile()
  if (!filename) return
  try {
    const value: unknown = JSON.parse(await window.electronAPI.readTextFile(filename))
    if (!value || typeof value !== 'object' ||
      (value as LogSession).format !== 'adblog-log-session-v1' ||
      !Array.isArray((value as LogSession).entries) ||
      !Array.isArray((value as LogSession).bookmarkedIds) ||
      (value as LogSession).entries.length > 50000 ||
      !(value as LogSession).entries.every(entry => entry && typeof entry.id === 'number' &&
        typeof entry.raw === 'string' && typeof entry.message === 'string' &&
        typeof entry.tag === 'string' && typeof entry.timestamp === 'string') ||
      !(value as LogSession).bookmarkedIds.every(id => typeof id === 'number') ||
      !(value as LogSession).filter || typeof (value as LogSession).filter.minLevel !== 'string' ||
      typeof (value as LogSession).serial !== 'string' || typeof (value as LogSession).savedAt !== 'string') {
      throw new Error('文件不是有效的 ADBlog 日志会话。')
    }
    const session = value as LogSession
    if (slot === 'a') sessionA.value = session
    else sessionB.value = session
    activeSlot.value = slot
    query.value = ''
    bookmarksOnly.value = false
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}
</script>
