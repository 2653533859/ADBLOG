<template>
  <div class="flex-1 overflow-y-auto bg-dark-900 p-6 text-gray-200">
    <div class="max-w-2xl space-y-5">
      <div><h1 class="text-lg font-semibold">Perfetto 系统追踪</h1><p class="mt-1 text-xs text-gray-500">采集设备的 CPU 调度、频率、图形、窗口与输入事件，或导入已有追踪文件。</p></div>
      <div class="rounded border border-dark-700 bg-dark-850 p-5 space-y-4 text-xs">
        <div>当前设备：{{ devices.selectedSerial || '未选择' }}</div>
        <label class="block">采集时长 <select v-model.number="duration" class="ml-2 rounded border border-dark-700 bg-dark-900 px-3 py-2"><option :value="5">5 秒</option><option :value="10">10 秒</option><option :value="20">20 秒</option><option :value="30">30 秒</option><option :value="60">60 秒</option></select></label>
        <div class="flex gap-2"><button @click="capture" :disabled="busy || !devices.isOnline" class="rounded bg-brand px-4 py-2 font-semibold text-dark-900 disabled:opacity-40">{{ busy ? '正在采集…' : '采集并保存追踪' }}</button><button @click="importTrace" :disabled="busy" class="rounded border border-dark-700 px-4 py-2">导入已有追踪</button></div>
        <div v-if="error" class="text-red-300 break-all">{{ error }}</div>
        <div v-if="trace" class="border-t border-dark-700 pt-3 space-y-2"><div>文件：<span class="font-mono break-all">{{ trace.path }}</span></div><div>大小：{{ (trace.bytes / 1024 / 1024).toFixed(2) }} MB</div><button @click="openViewer" class="rounded border border-brand px-3 py-2 text-brand">打开 Perfetto 分析界面</button><p class="text-gray-500">在分析界面中选择本地追踪文件；应用不会自动上传该文件。</p></div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useDeviceStore } from '../stores/device'
const devices = useDeviceStore()
const duration = ref(10)
const busy = ref(false)
const error = ref('')
const trace = ref<{ path: string; bytes: number } | null>(null)
async function capture(): Promise<void> {
  const serial = devices.selectedSerial
  if (!serial || !devices.isOnline || busy.value) return
  const destination = await window.electronAPI.showSaveDialog(`ADBlog-${Date.now()}.perfetto-trace`)
  if (!destination) return
  busy.value = true; error.value = ''
  try { trace.value = await window.electronAPI.captureTrace(serial, destination, duration.value) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { busy.value = false }
}
async function importTrace(): Promise<void> {
  const path = await window.electronAPI.showOpenDialogFile()
  if (!path) return
  error.value = ''
  try { trace.value = await window.electronAPI.inspectTrace(path) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
}
async function openViewer(): Promise<void> {
  try { await window.electronAPI.openTraceViewer() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
}
</script>
