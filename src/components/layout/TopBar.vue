<template>
  <header class="h-16 bg-dark-900/95 border-b border-dark-700 px-5 flex items-center justify-between gap-5 select-none shrink-0">
    <!-- Left: Logo & Device Selector -->
    <div class="flex items-center gap-5 min-w-0">
      <div class="flex items-center gap-3 text-white shrink-0">
        <div class="brand-mark" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div class="leading-none">
          <div class="text-[15px] font-semibold tracking-[0.08em]">ADBlog</div>
          <div class="mt-1 text-[8px] font-medium tracking-[0.24em] text-gray-500">DEVICE CONSOLE</div>
        </div>
      </div>

      <div class="h-7 w-px bg-dark-700"></div>

      <!-- Device Dropdown -->
      <div class="flex items-center gap-2">
        <div class="relative">
          <select
            :value="deviceStore.selectedSerial || ''"
            @change="onDeviceChange"
            class="appearance-none bg-dark-850 border border-dark-700 rounded-md px-3 py-2 pr-8 text-xs font-medium text-gray-100 focus:outline-none focus:border-brand cursor-pointer max-w-[260px] truncate"
          >
            <option value="" disabled>选择 Android 设备</option>
            <option v-for="dev in deviceStore.devices" :key="dev.serial" :value="dev.serial">
              {{ dev.model || dev.serial }} ({{ dev.serial }})
            </option>
          </select>
          <ChevronDown class="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <!-- Status Badge -->
        <div
          v-if="deviceStore.selectedDevice"
          class="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold tracking-wide uppercase border"
          :class="statusBadgeClasses"
        >
          <span class="w-1.5 h-1.5 rounded-full" :class="statusDotClasses"></span>
          <span>{{ deviceStore.selectedDevice.status }}</span>
        </div>

        <button
          v-if="deviceStore.selectedDevice"
          @click="disconnectCurrent"
          title="断开连接"
          class="p-2 text-gray-500 hover:text-red-400 hover:bg-dark-800 rounded-md"
        >
          <Unplug class="w-3.5 h-3.5" />
        </button>

        <button
          @click="deviceStore.fetchDevices"
          title="刷新设备列表"
          class="p-2 text-gray-500 hover:text-white hover:bg-dark-800 rounded-md"
        >
          <RefreshCw class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Center: Target App & PID Picker -->
    <div class="flex items-center gap-2.5 flex-1 max-w-md">
      <div class="text-[10px] font-semibold tracking-[0.12em] uppercase text-gray-500 flex items-center gap-1.5 whitespace-nowrap">
        <Package class="w-3.5 h-3.5 text-brand" />
        <span>目标应用:</span>
      </div>

      <div class="relative flex-1">
        <select
          :value="deviceStore.selectedPackage || ''"
          @change="onAppChange"
          :disabled="!deviceStore.isOnline || deviceStore.apps.length === 0"
          class="w-full appearance-none bg-dark-850 border border-dark-700 rounded-md px-3 py-2 pr-8 text-xs text-gray-100 focus:outline-none focus:border-brand cursor-pointer disabled:opacity-40 truncate"
        >
          <option value="">全部进程 (No Filter)</option>
          <option v-for="app in deviceStore.apps" :key="app.packageName" :value="app.packageName">
            {{ app.appName }} ({{ app.packageName }})
          </option>
        </select>
        <ChevronDown class="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <div v-if="deviceStore.selectedPackage" class="text-[10px] px-2 py-1.5 bg-dark-850 border border-dark-700 rounded text-gray-400 whitespace-nowrap">
        PID: <span class="text-brand font-mono">{{ deviceStore.selectedPids.length ? deviceStore.selectedPids.join(', ') : '未运行' }}</span>
      </div>
    </div>

    <!-- Right: Quick Connect Actions -->
    <div class="flex items-center gap-2">
      <button
        @click="showScanModal = true"
        class="flex items-center gap-1.5 px-3 py-2 bg-transparent hover:bg-dark-800 border border-dark-700 rounded-md text-xs font-medium text-gray-300"
      >
        <Wifi class="w-3.5 h-3.5 text-brand" />
        <span>扫描局域网</span>
      </button>

      <button
        @click="showConnectModal = true"
        class="flex items-center gap-1.5 px-3 py-2 bg-brand hover:bg-brand-hover text-dark-900 rounded-md text-xs font-semibold"
      >
        <Plus class="w-3.5 h-3.5" />
        <span>无线连接</span>
      </button>
    </div>

    <!-- Modals -->
    <ConnectModal v-model="showConnectModal" />
    <ScanModal v-model="showScanModal" />
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown, RefreshCw, Unplug, Package, Wifi, Plus } from 'lucide-vue-next'
import { useDeviceStore } from '../../stores/device'
import ConnectModal from '../modals/ConnectModal.vue'
import ScanModal from '../modals/ScanModal.vue'

const deviceStore = useDeviceStore()

const showConnectModal = ref(false)
const showScanModal = ref(false)

const statusBadgeClasses = computed(() => {
  const status = deviceStore.selectedDevice?.status
  if (status === 'online') return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
  if (status === 'unauthorized') return 'bg-amber-500/10 border-amber-500/30 text-amber-400'
  return 'bg-red-500/10 border-red-500/30 text-red-400'
})

const statusDotClasses = computed(() => {
  const status = deviceStore.selectedDevice?.status
  if (status === 'online') return 'bg-emerald-400'
  if (status === 'unauthorized') return 'bg-amber-400'
  return 'bg-red-400'
})

async function onDeviceChange(e: Event): Promise<void> {
  const select = e.target as HTMLSelectElement
  if (select.value) {
    await deviceStore.selectDevice(select.value)
  }
}

async function onAppChange(e: Event): Promise<void> {
  const select = e.target as HTMLSelectElement
  const pkg = select.value || null
  await deviceStore.selectApp(pkg)
}

async function disconnectCurrent(): Promise<void> {
  if (deviceStore.selectedSerial) {
    await deviceStore.disconnect(deviceStore.selectedSerial)
  }
}
</script>
