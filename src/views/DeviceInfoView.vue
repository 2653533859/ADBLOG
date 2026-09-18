<template>
  <div class="flex-1 flex flex-col h-full bg-dark-900 overflow-hidden select-none">
    <!-- Header -->
    <div class="h-12 bg-dark-850 border-b border-dark-700 px-4 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <Info class="w-4 h-4 text-brand" />
        <span class="text-xs font-semibold text-white">设备硬件与系统详细属性</span>
      </div>

      <button
        @click="refreshInfo"
        :disabled="deviceStore.isLoadingInfo"
        class="p-1.5 bg-dark-800 hover:bg-dark-750 border border-dark-700 text-gray-300 hover:text-white rounded-lg transition"
        title="刷新设备属性"
      >
        <RefreshCw class="w-4 h-4" :class="deviceStore.isLoadingInfo ? 'animate-spin' : ''" />
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl">
      <div v-if="deviceStore.isLoadingInfo" class="h-64 flex items-center justify-center text-gray-400 gap-2">
        <Loader2 class="w-8 h-8 animate-spin text-brand" />
        <span class="text-xs">正在读取设备属性...</span>
      </div>

      <div v-else-if="!deviceStore.deviceInfo" class="h-64 flex flex-col items-center justify-center text-gray-500 gap-2">
        <Smartphone class="w-12 h-12 opacity-30" />
        <span class="text-xs">暂无设备属性，请先连接并选择设备</span>
      </div>

      <div v-else class="space-y-6">
        <!-- Hardware Specs Card -->
        <div class="bg-dark-850 border border-dark-700 rounded-xl p-5">
          <h4 class="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Cpu class="w-4 h-4 text-brand" />
            <span>硬件参数与规格</span>
          </h4>

          <div class="grid grid-cols-3 gap-6 font-mono text-xs">
            <div>
              <div class="text-gray-500 font-sans text-[11px] mb-1">设备厂商</div>
              <div class="text-white font-medium">{{ deviceStore.deviceInfo.manufacturer }}</div>
            </div>
            <div>
              <div class="text-gray-500 font-sans text-[11px] mb-1">设备型号</div>
              <div class="text-white font-medium">{{ deviceStore.deviceInfo.model }}</div>
            </div>
            <div>
              <div class="text-gray-500 font-sans text-[11px] mb-1">品牌名称</div>
              <div class="text-white font-medium">{{ deviceStore.deviceInfo.brand }}</div>
            </div>
            <div>
              <div class="text-gray-500 font-sans text-[11px] mb-1">CPU 指令集 (ABI)</div>
              <div class="text-emerald-400 font-medium">{{ deviceStore.deviceInfo.abi }}</div>
            </div>
            <div>
              <div class="text-gray-500 font-sans text-[11px] mb-1">物理屏幕分辨率</div>
              <div class="text-white font-medium">{{ deviceStore.deviceInfo.screenResolution }}</div>
            </div>
            <div>
              <div class="text-gray-500 font-sans text-[11px] mb-1">屏幕像素密度</div>
              <div class="text-white font-medium">{{ deviceStore.deviceInfo.screenDensity }}</div>
            </div>
          </div>
        </div>

        <!-- System Specs Card -->
        <div class="bg-dark-850 border border-dark-700 rounded-xl p-5">
          <h4 class="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Layers class="w-4 h-4 text-cyan-400" />
            <span>操作系统与构建环境</span>
          </h4>

          <div class="grid grid-cols-3 gap-6 font-mono text-xs">
            <div>
              <div class="text-gray-500 font-sans text-[11px] mb-1">Android 系统版本</div>
              <div class="text-brand font-bold text-sm">Android {{ deviceStore.deviceInfo.androidVersion }}</div>
            </div>
            <div>
              <div class="text-gray-500 font-sans text-[11px] mb-1">API 级别 (SDK Level)</div>
              <div class="text-white font-medium">API {{ deviceStore.deviceInfo.sdkLevel }}</div>
            </div>
            <div>
              <div class="text-gray-500 font-sans text-[11px] mb-1">连接序列号</div>
              <div class="text-gray-300 font-medium">{{ deviceStore.selectedSerial }}</div>
            </div>
          </div>
        </div>

        <!-- Battery & Network Card -->
        <div class="bg-dark-850 border border-dark-700 rounded-xl p-5">
          <h4 class="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <BatteryCharging class="w-4 h-4 text-amber-400" />
            <span>电池状态与网络信息</span>
          </h4>

          <div class="grid grid-cols-3 gap-6 font-mono text-xs">
            <div>
              <div class="text-gray-500 font-sans text-[11px] mb-1">当前电量</div>
              <div class="text-amber-400 font-medium text-sm">
                {{ deviceStore.deviceInfo.batteryLevel }}%
                <span v-if="deviceStore.deviceInfo.isCharging" class="text-xs text-emerald-400 ml-1">(充电中)</span>
              </div>
            </div>
            <div>
              <div class="text-gray-500 font-sans text-[11px] mb-1">内网 IP 地址</div>
              <div class="text-white font-medium">{{ deviceStore.deviceInfo.ipAddress }}</div>
            </div>
            <div>
              <div class="text-gray-500 font-sans text-[11px] mb-1">MAC 物理地址</div>
              <div class="text-gray-400 font-medium">{{ deviceStore.deviceInfo.macAddress }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Info, RefreshCw, Loader2, Smartphone, Cpu, Layers, BatteryCharging } from 'lucide-vue-next'
import { useDeviceStore } from '../stores/device'

const deviceStore = useDeviceStore()

function refreshInfo(): void {
  if (deviceStore.selectedSerial) {
    deviceStore.fetchDeviceInfo(deviceStore.selectedSerial)
  }
}
</script>
