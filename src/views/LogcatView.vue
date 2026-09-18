<template>
  <div class="flex-1 flex flex-col h-full bg-dark-900 overflow-hidden select-none">
    <!-- Toolbar -->
    <div class="h-14 bg-dark-850 border-b border-dark-700 px-4 flex items-center justify-between gap-4 shrink-0">
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
        <div class="relative flex-1 max-w-sm">
          <Search class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="logcatStore.filter.keyword"
            type="text"
            placeholder="搜索关键字..."
            class="w-full pl-8 pr-16 py-1.5 bg-dark-900 border border-dark-700 rounded-md text-xs text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand"
          />
          <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              @click="logcatStore.filter.isRegex = !logcatStore.filter.isRegex"
              :class="logcatStore.filter.isRegex ? 'bg-brand text-white' : 'text-gray-400 hover:text-white'"
              title="正则表达式"
              class="px-1.5 py-0.5 text-[10px] font-mono rounded"
            >
              .*
            </button>
            <button
              @click="logcatStore.filter.isCaseSensitive = !logcatStore.filter.isCaseSensitive"
              :class="logcatStore.filter.isCaseSensitive ? 'bg-brand text-white' : 'text-gray-400 hover:text-white'"
              title="大小写敏感"
              class="px-1.5 py-0.5 text-[10px] font-mono rounded"
            >
              Aa
            </button>
          </div>
        </div>

        <!-- Tag Filter -->
        <div class="relative w-44">
          <input
            v-model="logcatStore.filter.tag"
            type="text"
            placeholder="过滤 Tag..."
            class="w-full px-2.5 py-1.5 bg-dark-900 border border-dark-700 rounded-md text-xs text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-1.5">
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
          <div class="text-xs text-gray-400">等待设备日志</div>
          <div class="mt-1 text-[10px] tracking-wide text-gray-600">连接设备并运行目标应用后，日志将在这里出现</div>
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
  ArrowDown
} from 'lucide-vue-next'
import { useLogcatStore } from '../stores/logcat'
import { LogLevel } from '../types'

const logcatStore = useLogcatStore()
const scrollContainer = ref<HTMLDivElement | null>(null)
const scrollOffset = ref(0)
const viewportHeight = ref(600)
const ROW_HEIGHT = 24
const OVERSCAN_ROWS = 16
let resizeObserver: ResizeObserver | null = null
let isUserScrolling = false

const filteredEntries = computed(() => logcatStore.filteredEntries)
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
    if (logcatStore.autoScroll && scrollContainer.value) {
      isUserScrolling = true
      await nextTick()
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
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
})
</script>
