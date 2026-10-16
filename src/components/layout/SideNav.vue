<template>
  <aside ref="navRoot" class="relative z-30 w-[72px] bg-dark-900 border-r border-dark-700 flex flex-col items-center py-3 select-none shrink-0">
    <div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 w-full px-2">
      <button
        v-for="item in pinnedItems"
        :key="item.id"
        type="button"
        @click="openTab(item.id)"
        :title="item.label"
        class="flex flex-col items-center justify-center h-12 w-14 shrink-0 rounded-md group relative mx-auto"
        :class="activeTab === item.id ? 'bg-dark-800 text-brand' : 'text-gray-500 hover:text-gray-200 hover:bg-dark-850'"
      >
        <component :is="item.icon" class="w-5 h-5" />
        <span class="text-[9px] mt-1 font-medium tracking-[0.08em]">{{ item.short }}</span>
        <span v-if="activeTab === item.id" class="absolute -left-2 top-1/2 -translate-y-1/2 w-px h-7 bg-brand" />
      </button>
    </div>

    <button
      type="button"
      @click="showMore = !showMore"
      title="更多功能与侧边栏设置"
      aria-label="更多功能与侧边栏设置"
      :aria-expanded="showMore"
      class="flex flex-col items-center justify-center h-12 w-14 shrink-0 rounded-md relative mt-2"
      :class="showMore || activeIsUnpinned ? 'bg-dark-800 text-brand' : 'text-gray-500 hover:text-gray-200 hover:bg-dark-850'"
    >
      <Ellipsis class="w-5 h-5" />
      <span class="text-[9px] mt-1 font-medium tracking-[0.08em]">更多</span>
      <span v-if="activeIsUnpinned" class="absolute -left-2 top-1/2 -translate-y-1/2 w-px h-7 bg-brand" />
    </button>

    <div v-if="showMore" class="absolute left-[72px] bottom-2 w-64 max-h-[70vh] overflow-y-auto rounded-lg border border-dark-700 bg-dark-850 shadow-2xl p-2">
      <div class="flex items-center justify-between px-2 py-2 text-xs">
        <span class="font-semibold text-white">全部功能</span>
        <button type="button" @click="resetPins" class="text-gray-500 hover:text-brand">恢复默认</button>
      </div>
      <div class="px-2 pb-2 text-[11px] text-gray-500">点击功能打开；点击图钉调整左侧快捷项。</div>
      <div v-for="item in navItems" :key="item.id" class="flex items-center gap-1 rounded hover:bg-dark-800" :class="activeTab === item.id ? 'bg-dark-800' : ''">
        <button type="button" @click="openTab(item.id)" class="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 text-left text-xs text-gray-300 hover:text-white">
          <component :is="item.icon" class="w-4 h-4 shrink-0 text-brand" />
          <span class="truncate">{{ item.label }}</span>
        </button>
        <button type="button" @click="togglePin(item.id)" :title="isPinned(item.id) ? '从快捷项移除' : '固定到快捷项'" :aria-label="`${isPinned(item.id) ? '取消固定' : '固定'}${item.label}`"
          class="p-2 text-gray-500 hover:text-brand" :class="isPinned(item.id) ? 'text-brand' : ''">
          <Pin class="w-3.5 h-3.5" :class="isPinned(item.id) ? 'fill-current' : ''" />
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { FileText, Smartphone, FolderTree, Terminal, Activity, LayoutGrid, Info, PackageSearch, BookOpen, Bug, Clock3, Tablets, ScanLine, Ellipsis, Pin, PanelsTopLeft } from 'lucide-vue-next'

const props = defineProps<{ activeTab: string }>()
const emit = defineEmits<{ (e: 'update:activeTab', tab: string): void }>()
const storageKey = 'adblog.sidebar.pins.v1'
const defaultPins = ['logcat', 'scrcpy', 'multi', 'files', 'perf']
const pinnedIds = ref<string[]>([...defaultPins])
const showMore = ref(false)
const navRoot = ref<HTMLElement | null>(null)

const navItems = [
  { id: 'logcat', label: 'Logcat 实时日志', short: '日志', icon: FileText },
  { id: 'scrcpy', label: '设备投屏与交互', short: '投屏', icon: Smartphone },
  { id: 'multi', label: '多设备投屏与日志', short: '多屏', icon: PanelsTopLeft },
  { id: 'files', label: '远程文件管理器', short: '文件', icon: FolderTree },
  { id: 'perf', label: '性能监控看板', short: '性能', icon: Activity },
  { id: 'incidents', label: '崩溃与 ANR 事件', short: '异常', icon: Bug },
  { id: 'timeline', label: '关联时间轴', short: '时间', icon: Clock3 },
  { id: 'devices', label: '多设备工作区', short: '设备', icon: Tablets },
  { id: 'trace', label: 'Perfetto 系统追踪', short: '追踪', icon: ScanLine },
  { id: 'sessions', label: '日志会话', short: '会话', icon: BookOpen },
  { id: 'terminal', label: 'Shell 终端', short: '终端', icon: Terminal },
  { id: 'apps', label: '已安装应用', short: '应用', icon: LayoutGrid },
  { id: 'info', label: '设备详细属性', short: '详情', icon: Info },
  { id: 'diagnostics', label: '一键问题采集', short: '诊断', icon: PackageSearch }
]

const pinnedItems = computed(() => navItems.filter(item => pinnedIds.value.includes(item.id)))
const activeIsUnpinned = computed(() => !pinnedIds.value.includes(props.activeTab))
function isPinned(id: string): boolean { return pinnedIds.value.includes(id) }
function openTab(id: string): void { emit('update:activeTab', id); showMore.value = false }
function savePins(): void { localStorage.setItem(storageKey, JSON.stringify(pinnedIds.value)) }
function togglePin(id: string): void {
  pinnedIds.value = isPinned(id) ? pinnedIds.value.filter(value => value !== id) : [...pinnedIds.value, id]
  savePins()
}
function resetPins(): void { pinnedIds.value = [...defaultPins]; savePins() }
function onPointerDown(event: PointerEvent): void {
  if (showMore.value && navRoot.value && !navRoot.value.contains(event.target as Node)) showMore.value = false
}
function onKeyDown(event: KeyboardEvent): void { if (event.key === 'Escape') showMore.value = false }
onMounted(() => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (Array.isArray(stored) && stored.every(id => typeof id === 'string')) {
      pinnedIds.value = [...new Set(stored)].filter(id => navItems.some(item => item.id === id))
    }
  } catch { /* Keep the default shortcuts if saved preferences are invalid. */ }
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('keydown', onKeyDown)
})
</script>
