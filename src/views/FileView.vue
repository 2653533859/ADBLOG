<template>
  <div class="flex-1 flex flex-col h-full bg-dark-900 overflow-hidden select-none">
    <!-- Path Bar & Shortcuts -->
    <div class="h-12 bg-dark-850 border-b border-dark-700 px-4 flex items-center justify-between gap-3 shrink-0">
      <!-- Navigation controls -->
      <div class="flex items-center gap-1">
        <button
          @click="deviceStore.selectedSerial && fileStore.goBack(deviceStore.selectedSerial)"
          class="p-1.5 hover:bg-dark-750 text-gray-400 hover:text-white rounded transition"
          title="后退"
        >
          <ArrowLeft class="w-4 h-4" />
        </button>

        <button
          @click="deviceStore.selectedSerial && fileStore.goForward(deviceStore.selectedSerial)"
          class="p-1.5 hover:bg-dark-750 text-gray-400 hover:text-white rounded transition"
          title="前进"
        >
          <ArrowRight class="w-4 h-4" />
        </button>

        <button
          @click="deviceStore.selectedSerial && fileStore.goUp(deviceStore.selectedSerial)"
          class="p-1.5 hover:bg-dark-750 text-gray-400 hover:text-white rounded transition"
          title="上级目录"
        >
          <ArrowUp class="w-4 h-4" />
        </button>

        <button
          @click="refreshCurrent"
          class="p-1.5 hover:bg-dark-750 text-gray-400 hover:text-white rounded transition"
          title="刷新目录"
        >
          <RefreshCw class="w-4 h-4" :class="fileStore.isLoading ? 'animate-spin' : ''" />
        </button>
      </div>

      <!-- Address Input -->
      <div class="flex-1 flex items-center gap-2">
        <div class="flex-1 relative">
          <Folder class="w-4 h-4 text-brand absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="pathInput"
            @keyup.enter="jumpToPath"
            type="text"
            class="w-full pl-8 pr-3 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        <button
          @click="handleUpload"
          class="px-3 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
        >
          <Upload class="w-3.5 h-3.5" />
          <span>上传文件</span>
        </button>

        <button
          @click="showCreateFolderPrompt = true"
          class="px-3 py-1.5 bg-dark-800 hover:bg-dark-750 border border-dark-700 text-gray-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
        >
          <FolderPlus class="w-3.5 h-3.5" />
          <span>新建文件夹</span>
        </button>
      </div>
    </div>

    <!-- Shortcuts row -->
    <div class="h-9 bg-dark-900 border-b border-dark-800 px-4 flex items-center gap-2 text-xs shrink-0 overflow-x-auto">
      <span class="text-gray-500 flex items-center gap-1">
        <Bookmark class="w-3.5 h-3.5" />
        <span>书签:</span>
      </span>
      <button
        v-for="b in bookmarks"
        :key="b.path"
        @click="deviceStore.selectedSerial && fileStore.loadPath(deviceStore.selectedSerial, b.path)"
        class="px-2.5 py-1 rounded bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white transition whitespace-nowrap"
      >
        {{ b.label }}
      </button>
    </div>

    <!-- File Table -->
    <div class="flex-1 overflow-y-auto bg-dark-900 relative">
      <div v-if="fileStore.isLoading" class="h-full flex items-center justify-center text-gray-400 gap-2">
        <Loader2 class="w-8 h-8 animate-spin text-brand" />
        <span class="text-xs">正在读取目录...</span>
      </div>

      <div v-else-if="fileStore.files.length === 0" class="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
        <FolderOpen class="w-10 h-10 opacity-30" />
        <span class="text-xs">当前目录为空</span>
      </div>

      <table v-else class="w-full text-left text-xs font-mono">
        <thead class="bg-dark-850 text-gray-400 text-[11px] sticky top-0 z-10 border-b border-dark-700">
          <tr>
            <th class="py-2 px-4 font-medium w-10">#</th>
            <th class="py-2 px-2 font-medium">名称</th>
            <th class="py-2 px-4 font-medium w-28 text-right">大小</th>
            <th class="py-2 px-4 font-medium w-32 text-right">权限</th>
            <th class="py-2 px-4 font-medium w-36 text-right">修改时间</th>
            <th class="py-2 px-4 font-medium w-24 text-center">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-dark-800">
          <tr
            v-for="(item, idx) in fileStore.files"
            :key="item.path"
            @dblclick="deviceStore.selectedSerial && fileStore.openItem(deviceStore.selectedSerial, item)"
            class="hover:bg-dark-800/60 transition group cursor-pointer"
          >
            <td class="py-2 px-4 text-gray-500">{{ idx + 1 }}</td>
            <td class="py-2 px-2 flex items-center gap-2">
              <Folder v-if="item.isDirectory" class="w-4 h-4 text-amber-400 shrink-0" />
              <File v-else class="w-4 h-4 text-blue-400 shrink-0" />
              <span class="truncate text-gray-200 group-hover:text-white font-sans" :title="item.name">
                {{ item.name }}
              </span>
            </td>
            <td class="py-2 px-4 text-right text-gray-400">{{ formatSize(item.size, item.isDirectory) }}</td>
            <td class="py-2 px-4 text-right text-gray-500">{{ item.permissions }}</td>
            <td class="py-2 px-4 text-right text-gray-500">{{ formatDate(item.modifyTime) }}</td>
            <td class="py-2 px-4 text-center flex items-center justify-center gap-1">
              <button
                v-if="!item.isDirectory"
                @click.stop="handleDownload(item)"
                title="下载到电脑"
                class="p-1 hover:bg-dark-750 text-gray-400 hover:text-white rounded"
              >
                <Download class="w-3.5 h-3.5" />
              </button>
              <button
                @click.stop="handleDelete(item)"
                title="删除"
                class="p-1 hover:bg-red-950 text-gray-400 hover:text-red-400 rounded"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Folder Modal -->
    <div v-if="showCreateFolderPrompt" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div class="bg-dark-850 border border-dark-700 rounded-xl p-5 w-80 shadow-2xl">
        <h4 class="text-sm font-semibold text-white mb-3">新建文件夹</h4>
        <input
          v-model="newFolderName"
          type="text"
          placeholder="文件夹名称"
          class="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand mb-4"
        />
        <div class="flex justify-end gap-2">
          <button @click="showCreateFolderPrompt = false" class="px-3 py-1.5 text-xs text-gray-300 hover:bg-dark-700 rounded">取消</button>
          <button @click="submitCreateFolder" class="px-3 py-1.5 text-xs bg-brand hover:bg-brand-hover text-white rounded">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RefreshCw,
  Folder,
  FolderOpen,
  File,
  Upload,
  FolderPlus,
  Bookmark,
  Loader2,
  Download,
  Trash2
} from 'lucide-vue-next'
import { useFileStore } from '../stores/files'
import { useDeviceStore } from '../stores/device'
import { RemoteFileItem } from '../types'

const fileStore = useFileStore()
const deviceStore = useDeviceStore()

const pathInput = ref('/sdcard')
const showCreateFolderPrompt = ref(false)
const newFolderName = ref('')

const bookmarks = [
  { label: '内部存储', path: '/sdcard' },
  { label: '下载 (Download)', path: '/sdcard/Download' },
  { label: '相册 (DCIM)', path: '/sdcard/DCIM' },
  { label: '图片 (Pictures)', path: '/sdcard/Pictures' },
  { label: '应用数据 (Android/data)', path: '/sdcard/Android/data' }
]

watch(
  () => fileStore.currentPath,
  (val) => {
    pathInput.value = val
  }
)

watch(
  () => deviceStore.selectedSerial,
  (serial) => {
    if (serial) {
      fileStore.loadPath(serial, '/sdcard')
    }
  }
)

onMounted(() => {
  if (deviceStore.selectedSerial) {
    fileStore.loadPath(deviceStore.selectedSerial, '/sdcard')
  }
})

function refreshCurrent(): void {
  if (deviceStore.selectedSerial) {
    fileStore.loadPath(deviceStore.selectedSerial, fileStore.currentPath)
  }
}

function jumpToPath(): void {
  if (deviceStore.selectedSerial && pathInput.value.trim()) {
    fileStore.loadPath(deviceStore.selectedSerial, pathInput.value.trim())
  }
}

async function handleUpload(): Promise<void> {
  if (deviceStore.selectedSerial) {
    await fileStore.uploadFile(deviceStore.selectedSerial)
  }
}

async function handleDownload(item: RemoteFileItem): Promise<void> {
  if (deviceStore.selectedSerial) {
    await fileStore.downloadFile(deviceStore.selectedSerial, item)
  }
}

async function handleDelete(item: RemoteFileItem): Promise<void> {
  if (confirm(`确定要删除 ${item.name} 吗？`)) {
    if (deviceStore.selectedSerial) {
      await fileStore.deleteItem(deviceStore.selectedSerial, item)
    }
  }
}

async function submitCreateFolder(): Promise<void> {
  if (deviceStore.selectedSerial && newFolderName.value.trim()) {
    await fileStore.createFolder(deviceStore.selectedSerial, newFolderName.value)
    showCreateFolderPrompt.value = false
    newFolderName.value = ''
  }
}

function formatSize(bytes: number, isDir: boolean): string {
  if (isDir) return '--'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDate(ms: number): string {
  if (!ms) return '--'
  const d = new Date(ms)
  return d.toLocaleDateString()
}
</script>
