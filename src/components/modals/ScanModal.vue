<template>
  <div v-if="modelValue" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
    <div class="bg-dark-850 border border-dark-700 rounded-xl p-6 w-[500px] max-h-[80vh] flex flex-col shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-white">局域网 Android 设备扫描</h3>
          <p class="text-xs text-gray-400 mt-0.5">验证 ADB 协议与授权状态，仅显示可连接设备</p>
        </div>
        <button @click="$emit('update:modelValue', false)" class="text-gray-400 hover:text-white">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="flex items-center gap-2 mb-4">
        <input
          v-model="customSubnet"
          type="text"
          placeholder="自定义网段前缀 (留空自动探测本机网段，如 192.168.1)"
          class="flex-1 px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand"
        />
        <button
          @click="startScan"
          :disabled="deviceStore.isScanning"
          class="px-4 py-2 text-xs bg-brand hover:bg-brand-hover text-white rounded-lg flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
        >
          <Loader2 v-if="deviceStore.isScanning" class="w-3.5 h-3.5 animate-spin" />
          <Search v-else class="w-3.5 h-3.5" />
          <span>{{ deviceStore.isScanning ? '正在扫描...' : '开始扫描' }}</span>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto border border-dark-700 rounded-lg bg-dark-900/60 p-2 min-h-[220px]">
        <div v-if="deviceStore.isScanning" class="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
          <Loader2 class="w-8 h-8 animate-spin text-brand" />
          <span class="text-xs">正在探测网段并验证 ADB 授权，请稍候...</span>
        </div>

        <div v-else-if="deviceStore.scanResults.length === 0" class="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
          <WifiOff class="w-8 h-8 opacity-40" />
          <span class="text-xs">未发现已开启并授权无线 ADB 的设备</span>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="item in deviceStore.scanResults"
            :key="item.ip"
            class="flex items-center justify-between p-3 bg-dark-800 hover:bg-dark-750 border border-dark-700 rounded-lg transition"
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Smartphone class="w-4 h-4" />
              </div>
              <div>
                <div class="text-sm font-medium text-white">{{ item.ip }}:{{ item.port }}</div>
                <div class="text-xs text-emerald-400">ADB 已验证{{ item.hostname ? ` · ${item.hostname}` : '' }}</div>
              </div>
            </div>

            <button
              @click="connectFoundDevice(item.ip, item.port)"
              :disabled="connectingIp === item.ip"
              class="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded flex items-center gap-1 disabled:opacity-50"
            >
              <Loader2 v-if="connectingIp === item.ip" class="w-3 h-3 animate-spin" />
              <span>{{ connectingIp === item.ip ? '连接中' : '一键连接' }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-4">
        <button
          @click="$emit('update:modelValue', false)"
          class="px-4 py-2 text-xs text-gray-300 hover:bg-dark-700 rounded-lg"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { X, Search, Loader2, WifiOff, Smartphone } from 'lucide-vue-next'
import { useDeviceStore } from '../../stores/device'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', val: boolean): void }>()

const deviceStore = useDeviceStore()
const customSubnet = ref('')
const connectingIp = ref<string | null>(null)

async function startScan(): Promise<void> {
  await deviceStore.scanLan(customSubnet.value.trim() || undefined)
}

async function connectFoundDevice(ip: string, port: number): Promise<void> {
  connectingIp.value = ip
  try {
    const res = await deviceStore.connect(ip, port)
    if (res.success) {
      emit('update:modelValue', false)
    }
  } finally {
    connectingIp.value = null
  }
}
</script>
