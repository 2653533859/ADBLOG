<template>
  <div v-if="modelValue" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
    <div class="bg-dark-850 border border-dark-700 rounded-xl p-6 w-96 shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-white">无线 ADB 连接</h3>
        <button @click="$emit('update:modelValue', false)" class="text-gray-400 hover:text-white">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1">设备 IP 地址</label>
          <input
            v-model="ip"
            type="text"
            placeholder="192.168.1.100"
            class="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1">ADB 端口 (默认 5555)</label>
          <input
            v-model.number="port"
            type="number"
            placeholder="5555"
            class="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand"
          />
        </div>

        <div v-if="errorMessage" class="text-xs text-red-400 bg-red-950/40 p-2 rounded border border-red-900">
          {{ errorMessage }}
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            @click="$emit('update:modelValue', false)"
            class="px-4 py-2 text-sm text-gray-300 hover:bg-dark-700 rounded-lg"
          >
            取消
          </button>
          <button
            @click="handleConnect"
            :disabled="isConnecting"
            class="px-4 py-2 text-sm bg-brand hover:bg-brand-hover text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
          >
            <Loader2 v-if="isConnecting" class="w-4 h-4 animate-spin" />
            <span>{{ isConnecting ? '连接中...' : '连接' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { X, Loader2 } from 'lucide-vue-next'
import { useDeviceStore } from '../../stores/device'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', val: boolean): void }>()

const deviceStore = useDeviceStore()
const ip = ref('172.16.102.214')
const port = ref(5555)
const isConnecting = ref(false)
const errorMessage = ref('')

async function handleConnect(): Promise<void> {
  if (!ip.value.trim()) {
    errorMessage.value = '请输入有效的 IP 地址'
    return
  }

  isConnecting.value = true
  errorMessage.value = ''

  try {
    const res = await deviceStore.connect(ip.value.trim(), port.value || 5555)
    if (res.success) {
      emit('update:modelValue', false)
    } else {
      errorMessage.value = res.message || '连接失败'
    }
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : '连接异常'
  } finally {
    isConnecting.value = false
  }
}
</script>
