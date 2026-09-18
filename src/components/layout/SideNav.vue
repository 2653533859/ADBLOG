<template>
  <aside class="w-[72px] bg-dark-900 border-r border-dark-700 flex flex-col items-center py-3 select-none shrink-0">
    <div class="flex flex-col gap-1.5 w-full px-2">
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="$emit('update:activeTab', item.id)"
        :title="item.label"
        class="flex flex-col items-center justify-center h-12 w-14 rounded-md group relative mx-auto"
        :class="activeTab === item.id ? 'bg-dark-800 text-brand' : 'text-gray-500 hover:text-gray-200 hover:bg-dark-850'"
      >
        <component :is="item.icon" class="w-5 h-5" />
        <span class="text-[9px] mt-1 font-medium tracking-[0.08em]">{{ item.short }}</span>

        <!-- Indicator -->
        <span
          v-if="activeTab === item.id"
          class="absolute -left-2 top-1/2 -translate-y-1/2 w-px h-7 bg-brand"
        ></span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { FileText, Smartphone, FolderTree, Terminal, Activity, LayoutGrid, Info } from 'lucide-vue-next'

defineProps<{ activeTab: string }>()
defineEmits<{ (e: 'update:activeTab', tab: string): void }>()

const navItems = [
  { id: 'logcat', label: 'Logcat 实时日志', short: '日志', icon: FileText },
  { id: 'scrcpy', label: '设备投屏与交互', short: '投屏', icon: Smartphone },
  { id: 'files', label: '远程文件管理器', short: '文件', icon: FolderTree },
  { id: 'terminal', label: 'Shell 终端', short: '终端', icon: Terminal },
  { id: 'perf', label: '性能监控看板', short: '性能', icon: Activity },
  { id: 'apps', label: '已安装应用', short: '应用', icon: LayoutGrid },
  { id: 'info', label: '设备详细属性', short: '详情', icon: Info }
]
</script>
