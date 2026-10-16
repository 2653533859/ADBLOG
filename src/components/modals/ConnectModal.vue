<template>
  <div v-if="modelValue" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
    <div class="bg-dark-850 border border-dark-700 rounded-xl p-6 w-96 shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-white">无线 ADB</h3>
        <button @click="$emit('update:modelValue', false)" class="text-gray-400 hover:text-white">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="space-y-4">
        <div class="flex rounded-lg border border-dark-700 p-1 text-xs">
          <button @click="mode = 'connect'; errorMessage = ''; successMessage = ''" class="flex-1 rounded px-3 py-2" :class="mode === 'connect' ? 'bg-dark-700 text-white' : 'text-gray-400'">连接设备</button>
          <button @click="mode = 'pair'; errorMessage = ''; successMessage = ''" class="flex-1 rounded px-3 py-2" :class="mode === 'pair' ? 'bg-dark-700 text-white' : 'text-gray-400'">配对新设备</button>
        </div>
        <p v-if="mode === 'pair'" class="text-xs leading-5 text-gray-400">在手机“开发者选项 → 无线调试 → 使用配对码配对设备”中查看配对地址和 6 位码。配对成功后，切回“连接设备”并输入无线调试页面显示的连接端口。</p>
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
          <label class="block text-xs font-medium text-gray-400 mb-1">{{ mode === 'pair' ? '配对端口' : '连接端口 (旧版 TCP/IP 默认 5555)' }}</label>
          <input
            v-if="mode === 'pair'"
            v-model.number="pairPort"
            type="number"
            placeholder="手机显示的配对端口"
            class="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand"
          />
          <input v-else v-model.number="port" type="number" placeholder="5555"
            class="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand" />
        </div>

        <div v-if="mode === 'pair'">
          <label class="block text-xs font-medium text-gray-400 mb-1">6 位配对码</label>
          <input v-model="pairCode" type="text" inputmode="numeric" maxlength="6" autocomplete="off"
            class="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand" />
        </div>

        <div v-if="errorMessage" class="text-xs text-red-400 bg-red-950/40 p-2 rounded border border-red-900">
          {{ errorMessage }}
        </div>
        <div v-if="successMessage" class="text-xs text-emerald-400 bg-emerald-950/40 p-2 rounded border border-emerald-900">{{ successMessage }}</div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            @click="$emit('update:modelValue', false)"
            class="px-4 py-2 text-sm text-gray-300 hover:bg-dark-700 rounded-lg"
          >
            取消
          </button>
          <button
            @click="mode === 'pair' ? handlePair() : handleConnect()"
            :disabled="isConnecting"
            class="px-4 py-2 text-sm bg-brand hover:bg-brand-hover text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
          >
            <Loader2 v-if="isConnecting" class="w-4 h-4 animate-spin" />
            <span>{{ isConnecting ? '处理中...' : mode === 'pair' ? '配对' : '连接' }}</span>
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
const mode = ref<'connect' | 'pair'>('connect')
const ip = ref('')
const port = ref(5555)
const pairPort = ref(0)
const pairCode = ref('')
const isConnecting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function handlePair(): Promise<void> {
  if (!ip.value.trim() || !Number.isInteger(pairPort.value) || !/^\d{6}$/.test(pairCode.value)) {
    errorMessage.value = '请输入手机显示的配对地址、端口和 6 位配对码'
    return
  }
  isConnecting.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const res = await deviceStore.pair(ip.value.trim(), pairPort.value, pairCode.value)
    if (res.success) {
      successMessage.value = '配对成功。请切换到连接设备，输入无线调试页面的连接端口。'
      pairCode.value = ''
    } else errorMessage.value = res.message || '配对失败'
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : '配对异常'
  } finally {
    isConnecting.value = false
  }
}

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
