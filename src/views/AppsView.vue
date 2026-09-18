<template>
  <div
    class="flex-1 flex flex-col h-full bg-dark-900 overflow-hidden select-none relative"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Header -->
    <div class="h-12 bg-dark-850 border-b border-dark-700 px-4 flex items-center justify-between gap-3 shrink-0">
      <div class="flex items-center gap-3">
        <button
          @click="selectAndInstallApk"
          :disabled="!deviceStore.isOnline || isInstalling"
          class="px-3 py-1.5 bg-brand hover:bg-brand-hover disabled:opacity-40 text-dark-900 rounded-md text-xs font-semibold flex items-center gap-1.5 transition"
          title="选择或拖入 APK 安装到当前设备"
        >
          <Loader2 v-if="isInstalling" class="w-3.5 h-3.5 animate-spin" />
          <Upload v-else class="w-3.5 h-3.5" />
          <span>{{ isInstalling ? '正在安装' : '安装 APK' }}</span>
        </button>

        <span class="text-xs font-semibold text-white flex items-center gap-1.5">
          <LayoutGrid class="w-4 h-4 text-brand" />
          <span>设备已安装应用管理</span>
        </span>

        <span class="text-xs text-gray-500">
          共 {{ deviceStore.apps.length }} 个应用
        </span>
      </div>

      <div class="flex items-center gap-3">
        <!-- Tab Filter -->
        <div class="flex items-center bg-dark-900 p-0.5 rounded-lg border border-dark-700 text-xs">
          <button
            v-for="tab in filterTabs"
            :key="tab.id"
            @click="activeFilter = tab.id"
            class="px-2.5 py-1 rounded-md transition"
            :class="activeFilter === tab.id ? 'bg-dark-750 text-white font-medium' : 'text-gray-400 hover:text-white'"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Search Input -->
        <div class="relative w-64">
          <Search class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索包名或应用名..."
            class="w-full pl-8 pr-3 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand"
          />
        </div>

        <button
          @click="refreshApps"
          :disabled="deviceStore.isLoadingApps"
          class="p-1.5 bg-dark-800 hover:bg-dark-750 border border-dark-700 text-gray-300 hover:text-white rounded-lg transition"
          title="刷新应用列表"
        >
          <RefreshCw class="w-4 h-4" :class="deviceStore.isLoadingApps ? 'animate-spin' : ''" />
        </button>
      </div>
    </div>

    <div
      v-if="installState !== 'idle'"
      class="mx-4 mt-3 px-3 py-2 rounded-md border text-xs flex items-start justify-between gap-3 shrink-0"
      :class="installState === 'success'
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
        : installState === 'error'
          ? 'bg-red-500/10 border-red-500/30 text-red-300'
          : 'bg-brand/10 border-brand/30 text-gray-300'"
    >
      <div class="flex items-start gap-2 min-w-0">
        <Loader2 v-if="installState === 'installing'" class="w-3.5 h-3.5 animate-spin shrink-0 mt-0.5" />
        <Check v-else-if="installState === 'success'" class="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <AlertCircle v-else class="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span class="select-text break-all">{{ installMessage }}</span>
      </div>
      <button v-if="installState !== 'installing'" class="opacity-70 hover:opacity-100" @click="clearInstallStatus">
        <X class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- App List Table -->
    <div class="flex-1 overflow-y-auto bg-dark-900 relative">
      <div v-if="deviceStore.isLoadingApps" class="h-full flex items-center justify-center text-gray-400 gap-2">
        <Loader2 class="w-8 h-8 animate-spin text-brand" />
        <span class="text-xs">正在拉取并解析设备应用列表...</span>
      </div>

      <div v-else-if="filteredApps.length === 0" class="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
        <Package class="w-10 h-10 opacity-30" />
        <span class="text-xs">未匹配到任何应用</span>
      </div>

      <table v-else class="w-full text-left text-xs font-mono">
        <thead class="bg-dark-850 text-gray-400 text-[11px] sticky top-0 z-10 border-b border-dark-700">
          <tr>
            <th class="py-2 px-4 font-medium w-12">#</th>
            <th class="py-2 px-2 font-medium">应用名称</th>
            <th class="py-2 px-4 font-medium">应用包名 (Package Name)</th>
            <th class="py-2 px-4 font-medium w-32 text-center">属性</th>
            <th class="py-2 px-4 font-medium w-36 text-center">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-dark-800 font-sans">
          <tr
            v-for="(app, idx) in filteredApps"
            :key="app.packageName"
            class="hover:bg-dark-800/60 transition group"
            :class="deviceStore.selectedPackage === app.packageName ? 'bg-brand/10' : ''"
          >
            <td class="py-2.5 px-4 text-gray-500 font-mono">{{ idx + 1 }}</td>
            <td class="py-2.5 px-2 font-medium text-white flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-dark-750 flex items-center justify-center text-brand shrink-0">
                <Box class="w-4 h-4" />
              </div>
              <span class="truncate">{{ app.appName }}</span>
            </td>
            <td class="py-2.5 px-4 font-mono text-gray-300 text-xs">{{ app.packageName }}</td>
            <td class="py-2.5 px-4 text-center">
              <span
                class="px-2 py-0.5 rounded text-[11px] border"
                :class="app.isSystemApp ? 'bg-dark-800 border-dark-700 text-gray-400' : 'bg-brand/10 border-brand/30 text-brand'"
              >
                {{ app.isSystemApp ? '系统预装' : '第三方' }}
              </span>
            </td>
            <td class="py-2.5 px-4 text-center">
              <button
                @click="setAsTarget(app.packageName)"
                class="px-2.5 py-1 text-xs rounded transition flex items-center gap-1 mx-auto"
                :class="deviceStore.selectedPackage === app.packageName
                  ? 'bg-emerald-600 text-white font-medium'
                  : 'bg-dark-800 hover:bg-brand hover:text-white text-gray-300 border border-dark-700'"
              >
                <Check v-if="deviceStore.selectedPackage === app.packageName" class="w-3.5 h-3.5" />
                <span>{{ deviceStore.selectedPackage === app.packageName ? '已作为目标' : '设为调试目标' }}</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="isDraggingApk"
      class="absolute inset-3 z-30 rounded-xl border-2 border-dashed border-brand bg-dark-900/95 backdrop-blur flex flex-col items-center justify-center gap-3 pointer-events-none"
    >
      <div class="w-14 h-14 rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-center">
        <Upload class="w-6 h-6 text-brand" />
      </div>
      <div class="text-sm font-semibold text-white">释放鼠标安装 APK</div>
      <div class="text-xs text-gray-500">将安装到 {{ deviceStore.selectedDevice?.model || deviceStore.selectedSerial }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { AlertCircle, LayoutGrid, Search, RefreshCw, Loader2, Package, Box, Check, Upload, X } from 'lucide-vue-next'
import { useDeviceStore } from '../stores/device'
import { useLogcatStore } from '../stores/logcat'
import { AppItem } from '../types'

const deviceStore = useDeviceStore()
const logcatStore = useLogcatStore()

const searchQuery = ref('')
const activeFilter = ref<'all' | 'user' | 'system'>('user')
const isInstalling = ref(false)
const isDraggingApk = ref(false)
const dragDepth = ref(0)
const installState = ref<'idle' | 'installing' | 'success' | 'error'>('idle')
const installMessage = ref('')

const filterTabs = [
  { id: 'user', label: '第三方应用' },
  { id: 'all', label: '全部' },
  { id: 'system', label: '系统预装' }
] as const

const filteredApps = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  return deviceStore.apps.filter((app: AppItem) => {
    if (activeFilter.value === 'user' && app.isSystemApp) return false
    if (activeFilter.value === 'system' && !app.isSystemApp) return false

    if (q) {
      return app.appName.toLowerCase().includes(q) || app.packageName.toLowerCase().includes(q)
    }
    return true
  })
})

function refreshApps(): void {
  if (deviceStore.selectedSerial) {
    deviceStore.fetchApps(deviceStore.selectedSerial)
  }
}

async function setAsTarget(pkg: string): Promise<void> {
  if (deviceStore.selectedPackage === pkg) {
    await deviceStore.selectApp(null)
    logcatStore.setTargetPid(null)
  } else {
    await deviceStore.selectApp(pkg)
    logcatStore.setTargetPid(deviceStore.selectedPid)
  }
}

async function selectAndInstallApk(): Promise<void> {
  if (!deviceStore.isOnline || isInstalling.value) return
  const localPath = await window.electronAPI?.showOpenDialogApk()
  if (!localPath) return
  const fileName = localPath.split(/[\\/]/).pop() || 'APK'
  await installApk(localPath, fileName)
}

async function installApk(localPath: string, fileName: string): Promise<void> {
  const serial = deviceStore.selectedSerial
  if (!serial || !window.electronAPI || isInstalling.value) return
  isInstalling.value = true
  installState.value = 'installing'
  installMessage.value = `正在将 ${fileName} 安装到 ${deviceStore.selectedDevice?.model || serial}…`
  try {
    const result = await window.electronAPI.installApk(serial, localPath)
    if (result.success) {
      installState.value = 'success'
      installMessage.value = `${fileName} 安装成功。`
      if (deviceStore.selectedSerial === serial) await deviceStore.fetchApps(serial)
    } else {
      installState.value = 'error'
      installMessage.value = formatInstallError(result.message)
    }
  } catch (error) {
    installState.value = 'error'
    installMessage.value = formatInstallError(error instanceof Error ? error.message : String(error))
  } finally {
    isInstalling.value = false
  }
}

function onDragEnter(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes('Files')) return
  dragDepth.value += 1
  isDraggingApk.value = true
}

function onDragOver(event: DragEvent): void {
  if (event.dataTransfer) event.dataTransfer.dropEffect = deviceStore.isOnline ? 'copy' : 'none'
}

function onDragLeave(): void {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
  if (dragDepth.value === 0) isDraggingApk.value = false
}

async function onDrop(event: DragEvent): Promise<void> {
  dragDepth.value = 0
  isDraggingApk.value = false
  const file = event.dataTransfer?.files[0]
  if (!file) return
  if (!deviceStore.isOnline) {
    installState.value = 'error'
    installMessage.value = '请先选择一台在线设备。'
    return
  }
  if (!file.name.toLowerCase().endsWith('.apk')) {
    installState.value = 'error'
    installMessage.value = '拖入的文件不是 APK 安装包。'
    return
  }
  let localPath = ''
  try {
    localPath = window.electronAPI?.getPathForFile(file) || ''
  } catch {
    localPath = ''
  }
  if (!localPath) {
    installState.value = 'error'
    installMessage.value = '无法读取拖入文件的本地路径。'
    return
  }
  await installApk(localPath, file.name)
}

function formatInstallError(message: string): string {
  const detail = message.trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' ')
  return `安装失败：${detail || 'ADB 未返回错误详情。'}`
}

function clearInstallStatus(): void {
  installState.value = 'idle'
  installMessage.value = ''
}
</script>
