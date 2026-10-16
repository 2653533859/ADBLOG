<template>
  <div class="flex-1 flex flex-col h-full bg-dark-900 overflow-hidden select-none">
    <!-- Toolbar -->
    <div class="min-h-14 bg-dark-850 border-b border-dark-700 px-4 py-2 flex items-center justify-between gap-4 shrink-0">
      <!-- Filters -->
      <div class="flex items-center gap-2.5 flex-1">
        <span class="text-[9px] font-semibold tracking-[0.18em] text-brand/80">LIVE</span>
        <span class="h-4 w-px bg-dark-700"></span>
        <!-- Log Level -->
        <div class="relative">
          <select
            v-model="logcatStore.filter.minLevel"
            class="appearance-none bg-dark-900 border border-dark-700 rounded-md px-2.5 py-1.5 pr-7 text-xs font-medium text-gray-300 focus:outline-none focus:border-brand cursor-pointer"
          >
            <option value="V">Verbose (全部)</option>
            <option value="D">Debug</option>
            <option value="I">Info</option>
            <option value="W">Warn</option>
            <option value="E">Error</option>
            <option value="A">Assert / Fatal</option>
          </select>
          <ChevronDown class="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <!-- Search Input -->
        <div class="relative flex-1 max-w-md min-w-40">
          <Search class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchDraft"
            type="text"
            placeholder="搜索消息或 Tag..."
            aria-label="搜索消息或 Tag"
            :aria-invalid="Boolean(searchError)"
            class="w-full pl-8 pr-3 py-1.5 bg-dark-900 border rounded-md text-xs text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand"
            :class="searchError ? 'border-red-500' : 'border-dark-700'"
          />
        </div>
        <button @click="showAdvanced = !showAdvanced" :aria-expanded="showAdvanced"
          class="px-2.5 py-1.5 rounded-md border border-dark-700 text-xs whitespace-nowrap"
          :class="showAdvanced || hasAdvancedFilters ? 'text-brand bg-brand/10' : 'text-gray-400 hover:text-white'">
          高级筛选{{ hasAdvancedFilters ? ' · 已启用' : '' }}
        </button>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-1.5">
        <button @click="saveSession" title="保存日志会话" class="p-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-700 text-gray-300 rounded-md"><Save class="w-4 h-4" /></button>
        <button
          @click="logcatStore.togglePause"
          :title="logcatStore.isPaused ? '继续' : '暂停'"
          class="p-1.5 rounded-md border"
          :class="logcatStore.isPaused ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-dark-800 border-dark-700 text-gray-300 hover:text-white'"
        >
          <Play v-if="logcatStore.isPaused" class="w-4 h-4" />
          <Pause v-else class="w-4 h-4" />
        </button>

        <button
          @click="logcatStore.toggleAutoScroll"
          :title="logcatStore.autoScroll ? '已开启自动滚屏' : '已锁定滚屏'"
          class="p-1.5 rounded-md border"
          :class="logcatStore.autoScroll ? 'bg-brand/20 border-brand text-brand' : 'bg-dark-800 border-dark-700 text-gray-400 hover:text-white'"
        >
          <ArrowDownToLine class="w-4 h-4" />
        </button>

        <button
          @click="logcatStore.clear"
          title="清空当前日志"
          class="p-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-700 text-gray-400 hover:text-white rounded-md"
        >
          <Trash2 class="w-4 h-4" />
        </button>

        <button
          @click="logcatStore.toggleRecording"
          :title="logcatStore.isRecording ? '停止录制' : '实时录制落盘'"
          class="p-1.5 rounded-md border"
          :class="logcatStore.isRecording ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-dark-800 border-dark-700 text-gray-300 hover:text-white'"
        >
          <Circle class="w-4 h-4" :class="logcatStore.isRecording ? 'fill-current' : ''" />
        </button>
      </div>
    </div>

    <div v-if="showAdvanced" class="shrink-0 border-b border-dark-700 bg-dark-850 px-4 py-3 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
      <label class="flex flex-col gap-1 text-gray-400">Tag 包含
        <input v-model="tagDraft" placeholder="例如 Network" class="filter-input" />
      </label>
      <label class="flex flex-col gap-1 text-gray-400">Tag 排除（逗号分隔）
        <input v-model="excludeDraft" placeholder="例如 chatty, OpenGL" class="filter-input" />
      </label>
      <label class="flex flex-col gap-1 text-gray-400">PID 精确匹配
        <input v-model="pidDraft" inputmode="numeric" placeholder="留空表示不限" :aria-invalid="Boolean(pidError)" class="filter-input" />
        <span v-if="pidError" class="text-red-400">{{ pidError }}</span>
      </label>
      <div class="flex flex-col gap-2 text-gray-400">
        <span>搜索选项</span>
        <div class="flex gap-2">
          <button @click="regexDraft = !regexDraft" :aria-pressed="regexDraft" class="filter-toggle" :class="regexDraft ? 'text-brand border-brand' : ''">.* 正则</button>
          <button @click="caseDraft = !caseDraft" :aria-pressed="caseDraft" class="filter-toggle" :class="caseDraft ? 'text-brand border-brand' : ''">Aa 区分大小写</button>
        </div>
      </div>
    </div>

    <div class="shrink-0 border-b border-dark-700 bg-dark-900 px-4 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
      <span>缓冲 {{ logcatStore.entries.length.toLocaleString() }}</span>
      <span>→</span><span>范围匹配 {{ logcatStore.scopeCount.toLocaleString() }}</span>
      <span>→</span><span class="text-brand">显示 {{ filteredEntries.length.toLocaleString() }}</span>
      <span class="h-3 w-px bg-dark-700 mx-1"></span>
      <button v-if="deviceStore.selectedPackage" @click="void deviceStore.selectApp(null)" class="filter-chip" title="移除应用范围">
        应用 {{ selectedAppLabel }} ×
      </button>
      <button v-if="logcatStore.filter.minLevel !== 'V'" @click="logcatStore.filter.minLevel = 'V'" class="filter-chip">级别 ≥ {{ logcatStore.filter.minLevel }} ×</button>
      <button v-if="logcatStore.filter.keyword" @click="clearSearch" class="filter-chip" title="移除已生效的搜索条件">搜索 {{ logcatStore.filter.keyword }} ×</button>
      <button v-if="logcatStore.filter.tag" @click="clearTag" class="filter-chip">Tag 包含 {{ logcatStore.filter.tag }} ×</button>
      <button v-if="logcatStore.filter.excludeTags.length" @click="clearExcludedTags" class="filter-chip">Tag 排除 {{ logcatStore.filter.excludeTags.join(', ') }} ×</button>
      <button v-if="logcatStore.filter.pid !== null" @click="clearPid" class="filter-chip">PID {{ logcatStore.filter.pid }} ×</button>
      <button v-if="hasAnyFilters" @click="clearAllFilters" class="text-gray-400 hover:text-white underline underline-offset-2">清除全部</button>
    </div>
    <div v-if="searchError" class="shrink-0 bg-red-950/30 px-4 py-1.5 text-xs text-red-300" role="alert">
      正则表达式无效：{{ searchError }}。继续使用上一次有效的搜索条件。
    </div>

    <!-- Logcat Table Window -->
    <div
      ref="scrollContainer"
      @scroll="handleScroll"
      class="flex-1 overflow-y-auto overflow-x-hidden font-mono text-[12px] bg-dark-900 select-text relative"
    >
      <div v-if="filteredEntries.length === 0" class="h-full flex flex-col items-center justify-center text-gray-500 gap-3 select-none">
        <div class="w-14 h-14 border border-dark-700 rounded-lg flex items-center justify-center bg-dark-850">
          <Terminal class="w-6 h-6 text-brand/50" />
        </div>
        <div class="text-center">
          <div class="text-xs text-gray-400">{{ emptyStateTitle }}</div>
          <div class="mt-1 text-[10px] tracking-wide text-gray-600">{{ emptyStateHint }}</div>
          <button v-if="deviceStore.selectedPackage && deviceStore.selectedPids.length === 0" @click="void deviceStore.selectApp(null)"
            class="mt-3 px-3 py-1.5 rounded border border-dark-700 text-brand hover:bg-dark-800">查看全部进程日志</button>
          <button v-else-if="hasAnyFilters && logcatStore.entries.length > 0" @click="clearAllFilters"
            class="mt-3 px-3 py-1.5 rounded border border-dark-700 text-brand hover:bg-dark-800">清除筛选条件</button>
        </div>
      </div>

      <div v-else>
        <div :style="{ height: `${topSpacerHeight}px` }"></div>
        <div class="divide-y divide-dark-800">
        <div
          v-for="log in visibleEntries"
          :key="log.id"
          class="flex items-center h-6 px-2 hover:bg-dark-800/80 group leading-6"
          :class="getRowClass(log.level)"
        >
          <button @click="toggleBookmark(log.id)" :title="bookmarkedIds.includes(log.id) ? '移除标记' : '标记关键日志'"
            class="w-6 shrink-0 text-center select-none" :class="bookmarkedIds.includes(log.id) ? 'text-amber-400' : 'text-gray-700 group-hover:text-gray-400'">★</button>
          <!-- Time -->
          <span class="text-gray-500 w-36 shrink-0 select-none">{{ log.timestamp }}</span>
          <!-- PID-TID -->
          <span class="text-gray-400 w-24 shrink-0 text-right pr-3 select-none">{{ log.pid }}-{{ log.tid }}</span>
          <!-- Level Badge -->
          <span class="w-6 shrink-0 font-bold select-none text-center" :class="getLevelBadgeClass(log.level)">
            {{ log.level }}
          </span>
          <!-- Tag -->
          <span class="w-44 shrink-0 px-2 truncate font-semibold" :class="getTagClass(log.level)" :title="log.tag">
            {{ log.tag }}
          </span>
          <!-- Message -->
          <span class="flex-1 truncate whitespace-nowrap selection:bg-brand/30 selection:text-white" :class="getMessageClass(log.level)" :title="log.message">
            {{ log.message }}
          </span>
        </div>
        </div>
        <div :style="{ height: `${bottomSpacerHeight}px` }"></div>
      </div>

      <!-- Lock Floating Button -->
      <button
        v-if="!logcatStore.autoScroll"
        @click="scrollToBottomManual"
        class="fixed bottom-12 left-1/2 -translate-x-1/2 bg-brand/90 hover:bg-brand text-white px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 text-xs font-sans transition z-20"
      >
        <ArrowDown class="w-3.5 h-3.5" />
        <span>滚屏已锁定，点击回到最新</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ChevronDown,
  Search,
  Play,
  Pause,
  ArrowDownToLine,
  Trash2,
  Circle,
  Terminal,
  ArrowDown,
  Save
} from 'lucide-vue-next'
import { useLogcatStore } from '../stores/logcat'
import { useDeviceStore } from '../stores/device'
import { useIncidentStore } from '../stores/incidents'
import { useTimelineStore } from '../stores/timeline'
import { usePerfStore } from '../stores/perf'
import { logTimestampToEpoch } from '../utils/incident-detection'
import { LogLevel, LogSession } from '../types'

const logcatStore = useLogcatStore()
const deviceStore = useDeviceStore()
const incidentStore = useIncidentStore()
const timelineStore = useTimelineStore()
const perfStore = usePerfStore()
const bookmarkedIds = computed(() => timelineStore.events
  .filter(event => event.serial === deviceStore.selectedSerial && event.kind === 'bookmark')
  .map(event => event.logId).filter((id): id is number => id !== undefined))

function toggleBookmark(id: number): void {
  const serial = deviceStore.selectedSerial
  const entry = logcatStore.entries.find(value => value.id === id)
  if (serial && entry) timelineStore.toggleBookmark(serial, id,
    logTimestampToEpoch(entry.timestamp), `${entry.tag}: ${entry.message.slice(0, 80)}`)
}

async function saveSession(): Promise<void> {
  if (!deviceStore.selectedSerial || logcatStore.entries.length === 0) return
  const destination = await window.electronAPI.showSaveDialog(`ADBlog-session-${Date.now()}.json`)
  if (!destination) return
  const session: LogSession = {
    format: 'adblog-log-session-v1', savedAt: new Date().toISOString(),
    serial: deviceStore.selectedSerial, selectedPackage: deviceStore.selectedPackage,
    filter: JSON.parse(JSON.stringify(logcatStore.filter)),
    entries: logcatStore.entries.map(entry => ({ ...entry })),
    bookmarkedIds: bookmarkedIds.value.filter(id => logcatStore.entries.some(entry => entry.id === id)),
    incidents: incidentStore.forDevice(deviceStore.selectedSerial).map(event => ({ ...event, excerpt: [...event.excerpt] })),
    performanceSamples: perfStore.getHistoryForDevice(deviceStore.selectedSerial),
    timelineEvents: timelineStore.forDevice(deviceStore.selectedSerial).map(event => ({ ...event }))
  }
  await window.electronAPI.writeTextFile(destination, JSON.stringify(session))
}
const showAdvanced = ref(false)
const searchDraft = ref(logcatStore.filter.keyword)
const regexDraft = ref(logcatStore.filter.isRegex)
const caseDraft = ref(logcatStore.filter.isCaseSensitive)
const tagDraft = ref(logcatStore.filter.tag)
const excludeDraft = ref(logcatStore.filter.excludeTags.join(', '))
const pidDraft = ref(logcatStore.filter.pid?.toString() || '')
const searchError = ref('')
const pidError = computed(() => pidDraft.value && (!/^[1-9]\d*$/.test(pidDraft.value) || !Number.isSafeInteger(Number(pidDraft.value)))
  ? '请输入有效的正整数 PID' : '')
let searchTimer: ReturnType<typeof setTimeout> | null = null
let tagTimer: ReturnType<typeof setTimeout> | null = null
let excludeTimer: ReturnType<typeof setTimeout> | null = null
let pidTimer: ReturnType<typeof setTimeout> | null = null
const scrollContainer = ref<HTMLDivElement | null>(null)
const scrollOffset = ref(0)
const viewportHeight = ref(600)
const ROW_HEIGHT = 24
const OVERSCAN_ROWS = 16
let resizeObserver: ResizeObserver | null = null
let isUserScrolling = false

const filteredEntries = computed(() => logcatStore.filteredEntries)
const selectedAppLabel = computed(() => deviceStore.apps.find(app => app.packageName === deviceStore.selectedPackage)?.appName
  || deviceStore.selectedPackage || '')
const hasAdvancedFilters = computed(() => Boolean(logcatStore.filter.tag || logcatStore.filter.excludeTags.length ||
  logcatStore.filter.pid !== null || logcatStore.filter.isRegex || logcatStore.filter.isCaseSensitive))
const hasAnyFilters = computed(() => Boolean(deviceStore.selectedPackage || logcatStore.filter.minLevel !== 'V' ||
  logcatStore.filter.keyword || hasAdvancedFilters.value))
const emptyStateTitle = computed(() => {
  if (!deviceStore.selectedSerial || !deviceStore.isOnline) return '未连接到可用设备'
  if (deviceStore.selectedPackage && deviceStore.selectedPids.length === 0) return '目标应用当前未运行'
  if (logcatStore.entries.length === 0) return '等待设备日志'
  if (deviceStore.selectedPackage && logcatStore.scopeCount === 0) return '缓冲区内没有该应用的日志'
  return '当前筛选条件没有匹配结果'
})
const emptyStateHint = computed(() => {
  if (!deviceStore.selectedSerial || !deviceStore.isOnline) return '请先选择并连接 Android 设备'
  if (deviceStore.selectedPackage && deviceStore.selectedPids.length === 0) return '启动应用后会自动识别新 PID；也可以查看全部进程日志'
  if (logcatStore.entries.length === 0) return '正在采集日志；应用启动或操作设备后会在这里显示'
  if (deviceStore.selectedPackage && logcatStore.scopeCount === 0) return '该应用当前 PID 没有出现在最近的缓冲日志中'
  return '已收到日志，但被级别、搜索、Tag 或 PID 条件筛除'
})

watch([searchDraft, regexDraft, caseDraft], () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchError.value = ''
  if (regexDraft.value && searchDraft.value) {
    try {
      new RegExp(searchDraft.value, caseDraft.value ? '' : 'i')
    } catch (error) {
      searchError.value = error instanceof Error ? error.message : '语法错误'
      return
    }
  }
  searchTimer = setTimeout(() => {
    logcatStore.filter.keyword = searchDraft.value
    logcatStore.filter.isRegex = regexDraft.value
    logcatStore.filter.isCaseSensitive = caseDraft.value
    searchTimer = null
  }, 180)
})

watch(tagDraft, value => {
  if (tagTimer) clearTimeout(tagTimer)
  tagTimer = setTimeout(() => { logcatStore.filter.tag = value.trim(); tagTimer = null }, 180)
})
watch(excludeDraft, value => {
  if (excludeTimer) clearTimeout(excludeTimer)
  excludeTimer = setTimeout(() => {
    logcatStore.filter.excludeTags = [...new Set(value.split(',').map(tag => tag.trim()).filter(Boolean))]
    excludeTimer = null
  }, 180)
})
watch(pidDraft, value => {
  if (pidTimer) clearTimeout(pidTimer)
  if (pidError.value) return
  pidTimer = setTimeout(() => {
    logcatStore.filter.pid = value ? Number(value) : null
    pidTimer = null
  }, 180)
})

function clearSearch(): void {
  if (searchTimer) clearTimeout(searchTimer)
  searchDraft.value = ''
  regexDraft.value = false
  caseDraft.value = false
  searchError.value = ''
  logcatStore.filter.keyword = ''
  logcatStore.filter.isRegex = false
  logcatStore.filter.isCaseSensitive = false
}

function clearTag(): void {
  if (tagTimer) clearTimeout(tagTimer)
  tagDraft.value = ''
  logcatStore.filter.tag = ''
}

function clearExcludedTags(): void {
  if (excludeTimer) clearTimeout(excludeTimer)
  excludeDraft.value = ''
  logcatStore.filter.excludeTags = []
}

function clearPid(): void {
  if (pidTimer) clearTimeout(pidTimer)
  pidDraft.value = ''
  logcatStore.filter.pid = null
}

function clearAllFilters(): void {
  clearSearch()
  clearTag()
  clearExcludedTags()
  clearPid()
  logcatStore.clearDisplayFilters()
  if (deviceStore.selectedPackage) void deviceStore.selectApp(null)
}
const firstVisibleIndex = computed(() => Math.max(0, Math.floor(scrollOffset.value / ROW_HEIGHT) - OVERSCAN_ROWS))
const lastVisibleIndex = computed(() => Math.min(
  filteredEntries.value.length,
  Math.ceil((scrollOffset.value + viewportHeight.value) / ROW_HEIGHT) + OVERSCAN_ROWS
))
const visibleEntries = computed(() => filteredEntries.value.slice(firstVisibleIndex.value, lastVisibleIndex.value))
const topSpacerHeight = computed(() => firstVisibleIndex.value * ROW_HEIGHT)
const bottomSpacerHeight = computed(() => Math.max(0, (filteredEntries.value.length - lastVisibleIndex.value) * ROW_HEIGHT))

function getRowClass(level: LogLevel): string {
  if (level === 'E' || level === 'A') return 'bg-red-950/20'
  if (level === 'W') return 'bg-amber-950/10'
  return ''
}

function getLevelBadgeClass(level: LogLevel): string {
  switch (level) {
    case 'V': return 'text-gray-400'
    case 'D': return 'text-blue-400'
    case 'I': return 'text-emerald-400'
    case 'W': return 'text-amber-400'
    case 'E': return 'text-rose-500'
    case 'A': return 'text-red-500'
    default: return 'text-gray-400'
  }
}

function getTagClass(level: LogLevel): string {
  switch (level) {
    case 'V': return 'text-gray-400'
    case 'D': return 'text-blue-300'
    case 'I': return 'text-emerald-300'
    case 'W': return 'text-amber-300'
    case 'E': return 'text-rose-400'
    case 'A': return 'text-red-400'
    default: return 'text-gray-400'
  }
}

function getMessageClass(level: LogLevel): string {
  switch (level) {
    case 'V': return 'text-gray-400'
    case 'D': return 'text-blue-100'
    case 'I': return 'text-gray-200'
    case 'W': return 'text-amber-200'
    case 'E': return 'text-rose-300'
    case 'A': return 'text-red-300 font-semibold'
    default: return 'text-gray-300'
  }
}

function handleScroll(): void {
  if (!scrollContainer.value) return
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value
  // Keep only the visible window in the DOM. A full 15,000-row Vue tree can
  // otherwise consume over a gigabyte and delay every click.
  scrollOffset.value = scrollTop
  const isBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 40

  if (!isBottom && logcatStore.autoScroll && !isUserScrolling) {
    logcatStore.autoScroll = false
  } else if (isBottom && !logcatStore.autoScroll) {
    logcatStore.autoScroll = true
  }
}

function scrollToBottomManual(): void {
  logcatStore.autoScroll = true
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
}

// Auto scroll on new logs
watch(
  () => filteredEntries.value.length,
  async () => {
    if (scrollContainer.value) {
      isUserScrolling = true
      await nextTick()
      if (scrollContainer.value) {
        if (logcatStore.autoScroll) scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
        else scrollContainer.value.scrollTop = Math.min(scrollContainer.value.scrollTop,
          Math.max(0, scrollContainer.value.scrollHeight - scrollContainer.value.clientHeight))
      }
      isUserScrolling = false
    }
  }
)

onMounted(() => {
  const container = scrollContainer.value
  if (!container) return
  viewportHeight.value = container.clientHeight
  resizeObserver = new ResizeObserver(entries => {
    viewportHeight.value = entries[0]?.contentRect.height || container.clientHeight
  })
  resizeObserver.observe(container)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (searchTimer) clearTimeout(searchTimer)
  if (tagTimer) clearTimeout(tagTimer)
  if (excludeTimer) clearTimeout(excludeTimer)
  if (pidTimer) clearTimeout(pidTimer)
})
</script>

<style scoped>
.filter-input { @apply bg-dark-900 border border-dark-700 rounded-md px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand; }
.filter-chip { @apply max-w-48 truncate px-2 py-0.5 rounded border border-dark-700 bg-dark-850 text-gray-300 hover:text-white hover:border-brand; }
.filter-toggle { @apply px-2 py-1 rounded border border-dark-700 text-gray-400 hover:text-white; }
</style>
