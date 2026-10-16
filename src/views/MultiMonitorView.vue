<template>
  <div class="flex h-full flex-col overflow-hidden bg-dark-900 text-gray-200">
    <header class="flex shrink-0 flex-wrap items-center gap-3 border-b border-dark-700 px-5 py-3">
      <div>
        <h1 class="text-sm font-semibold text-white">多设备投屏与日志</h1>
        <p class="mt-1 text-xs text-gray-500">每台设备独立投屏、解码和采集日志；最多同时查看 4 台。</p>
      </div>
      <div class="ml-auto flex items-center gap-2 text-xs">
        <label for="multi-quality" class="text-gray-400">采集画质</label>
        <select id="multi-quality" v-model="quality" class="rounded border border-dark-700 bg-dark-850 px-2 py-1.5">
          <option value="balanced">流畅 · 1280 px / 6 Mbps</option>
          <option value="clear">清晰 · 1920 px / 12 Mbps</option>
          <option value="ultra">超清 · 2560 px / 20 Mbps</option>
        </select>
        <button class="rounded border border-dark-700 px-3 py-1.5 hover:text-white disabled:opacity-50" :disabled="deviceStore.isFetchingDevices" @click="refreshDevices">
          {{ deviceStore.isFetchingDevices ? '检测中…' : '检测设备' }}
        </button>
      </div>
    </header>
    <div class="shrink-0 flex flex-wrap items-center gap-2 border-b border-dark-700 px-5 py-2 text-xs">
      <span class="mr-1 text-gray-500">已选择 {{ selectedSerials.length }}/4</span>
      <label v-for="device in onlineDevices" :key="device.serial" class="flex cursor-pointer items-center gap-1.5 rounded border border-dark-700 px-2 py-1 hover:text-white">
        <input type="checkbox" class="accent-brand" :checked="selectedSerials.includes(device.serial)" :disabled="!selectedSerials.includes(device.serial) && selectedSerials.length >= 4" @change="toggleDevice(device.serial)" />
        <span>{{ device.model || device.serial }}</span>
        <span class="text-gray-500">{{ device.connectionType.toUpperCase() }}</span>
      </label>
      <span v-if="!onlineDevices.length" class="text-gray-500">未发现在线设备。连接 USB 或无线 ADB 后点击“检测设备”。</span>
    </div>
    <div v-if="error" class="shrink-0 border-b border-red-900 px-5 py-2 text-xs text-red-300">{{ error }}</div>
    <div class="flex-1 overflow-auto p-4">
      <div v-if="selectedDevices.length" class="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <DeviceMonitorCard v-for="device in selectedDevices" :key="device.serial" :serial="device.serial"
          :model="device.model || device.serial" :max-size="settings.maxSize" :bit-rate="settings.bitRate" :max-fps="settings.maxFps"
          @remove="toggleDevice" />
      </div>
      <div v-else class="flex h-full items-center justify-center text-sm text-gray-500">选择设备后，这里会同时显示各设备的画面和实时日志。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DeviceMonitorCard from '../components/multi/DeviceMonitorCard.vue'
import { useDeviceStore } from '../stores/device'

const deviceStore = useDeviceStore()
const quality = ref<'balanced' | 'clear' | 'ultra'>('clear')
const settings = computed(() => ({
  balanced: { maxSize: 1280, bitRate: 6_000_000, maxFps: 30 },
  clear: { maxSize: 1920, bitRate: 12_000_000, maxFps: 30 },
  ultra: { maxSize: 2560, bitRate: 20_000_000, maxFps: 30 }
})[quality.value])
const selectedSerials = ref<string[]>([])
const onlineDevices = computed(() => deviceStore.devices.filter(device => device.status === 'online'))
const selectedDevices = computed(() => selectedSerials.value.map(serial => onlineDevices.value.find(device => device.serial === serial)).filter((device): device is NonNullable<typeof device> => !!device))
const error = ref('')
let initialized = false
watch(onlineDevices, devices => {
  const online = new Set(devices.map(device => device.serial))
  selectedSerials.value = selectedSerials.value.filter(serial => online.has(serial))
  if (!initialized && devices.length) {
    selectedSerials.value = devices.slice(0, 2).map(device => device.serial)
    initialized = true
  }
}, { immediate: true })
function toggleDevice(serial: string): void {
  if (selectedSerials.value.includes(serial)) selectedSerials.value = selectedSerials.value.filter(value => value !== serial)
  else if (selectedSerials.value.length < 4) selectedSerials.value = [...selectedSerials.value, serial]
}
async function refreshDevices(): Promise<void> {
  error.value = ''
  try { await deviceStore.fetchDevices() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason) }
}
</script>
