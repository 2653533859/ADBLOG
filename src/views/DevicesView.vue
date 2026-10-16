<template>
  <div class="flex-1 overflow-y-auto bg-dark-900 p-5 text-gray-200 space-y-5">
    <div class="flex justify-between items-center"><div><h1 class="text-lg font-semibold">多设备工作区</h1><p class="text-xs text-gray-500 mt-1">按需检测设备，切换当前工作设备，或批量安装同一个 APK。</p></div><button @click="refresh" :disabled="devices.isFetchingDevices" class="rounded border border-dark-700 px-3 py-2 text-xs">{{ devices.isFetchingDevices ? '检测中…' : '检测设备' }}</button></div>
    <div v-if="!devices.devices.length" class="text-sm text-gray-500">未检测到设备，请连接 USB 或无线 ADB 后点击检测设备。</div>
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <div v-for="device in devices.devices" :key="device.serial" class="rounded border p-4 bg-dark-850" :class="devices.selectedSerial === device.serial ? 'border-brand' : 'border-dark-700'">
        <div class="flex items-center gap-3"><input type="checkbox" :disabled="device.status !== 'online' || installing" :checked="selectedSerials.includes(device.serial)" @change="toggle(device.serial)" /><div class="min-w-0 flex-1"><div class="font-medium truncate">{{ device.model || device.serial }}</div><div class="text-xs font-mono text-gray-500 break-all">{{ device.serial }} · {{ device.connectionType.toUpperCase() }} · {{ device.status }}</div></div><button @click="devices.selectDevice(device.serial)" :disabled="device.status !== 'online'" class="rounded border border-dark-700 px-3 py-1.5 text-xs disabled:opacity-40">{{ devices.selectedSerial === device.serial ? '当前设备' : '切换' }}</button></div>
        <div class="mt-3 text-xs text-gray-500">本次工作区异常 {{ incidents.forDevice(device.serial).length }} 条 · 时间轴 {{ timeline.forDevice(device.serial).length }} 条 · 已保留日志 {{ logCount(device.serial) }} 条</div>
      </div>
    </div>
    <div v-if="devices.selectedSerial" class="rounded border border-dark-700 bg-dark-850 p-4 text-xs"><div class="font-semibold mb-2">{{ devices.selectedSerial }} · 最近日志</div><div class="max-h-40 overflow-auto space-y-1 font-mono text-gray-400"><div v-for="entry in recentLogs" :key="entry.id" class="break-all">{{ entry.timestamp }} {{ entry.tag }}: {{ entry.message }}</div><div v-if="!recentLogs.length">当前工作区暂无日志</div></div></div>
    <div class="rounded border border-dark-700 bg-dark-850 p-4 text-xs space-y-3">
      <div class="font-semibold text-sm">批量安装 APK</div><div>已选择 {{ selectedSerials.length }} 台在线设备；逐台安装，独立显示结果。</div>
      <button @click="install" :disabled="installing || !selectedSerials.length" class="rounded bg-brand px-4 py-2 font-semibold text-dark-900 disabled:opacity-40">{{ installing ? '安装中…' : '选择 APK 并安装' }}</button>
      <div v-for="item in results" :key="item.serial" class="border-t border-dark-700 pt-2"><span class="font-mono">{{ item.serial }}</span> · <span :class="item.success ? 'text-brand' : 'text-red-300'">{{ item.message }}</span></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDeviceStore } from '../stores/device'
import { useIncidentStore } from '../stores/incidents'
import { useTimelineStore } from '../stores/timeline'
import { useLogcatStore } from '../stores/logcat'
import { useDeviceWorkspacesStore } from '../stores/device-workspaces'
const devices = useDeviceStore()
const incidents = useIncidentStore()
const timeline = useTimelineStore()
const logcat = useLogcatStore()
const workspaces = useDeviceWorkspacesStore()
function logCount(serial: string): number { return logcat.currentSerial === serial ? logcat.entries.length : workspaces.logsFor(serial).length }
const recentLogs = computed(() => {
  const serial = devices.selectedSerial
  if (!serial) return []
  return (logcat.currentSerial === serial ? logcat.entries : workspaces.logsFor(serial)).slice(-20).reverse()
})
const selectedSerials = ref<string[]>([])
const installing = ref(false)
const results = ref<{ serial: string; success: boolean; message: string }[]>([])
watch(() => devices.devices, list => { selectedSerials.value = selectedSerials.value.filter(serial => list.some(device => device.serial === serial && device.status === 'online')) })
function toggle(serial: string): void {
  selectedSerials.value = selectedSerials.value.includes(serial) ? selectedSerials.value.filter(item => item !== serial) : [...selectedSerials.value, serial]
}
async function refresh(): Promise<void> { await devices.fetchDevices() }
async function install(): Promise<void> {
  if (installing.value || !selectedSerials.value.length) return
  const path = await window.electronAPI.showOpenDialogApk()
  if (!path) return
  installing.value = true
  results.value = []
  const targets = [...selectedSerials.value]
  for (const serial of targets) {
    if (!devices.devices.some(device => device.serial === serial && device.status === 'online')) {
      results.value.push({ serial, success: false, message: '设备已离线' }); continue
    }
    try { results.value.push({ serial, ...(await window.electronAPI.installApk(serial, path)) }) }
    catch (error) { results.value.push({ serial, success: false, message: error instanceof Error ? error.message : String(error) }) }
  }
  installing.value = false
}
</script>
