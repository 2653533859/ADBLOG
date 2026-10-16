<template>
  <div class="flex-1 overflow-y-auto bg-dark-900 p-6 text-gray-200">
    <div class="max-w-2xl space-y-5">
      <div>
        <h1 class="text-lg font-semibold">一键问题采集</h1>
        <p class="mt-1 text-xs text-gray-500">将当前设备的截图、设备信息、近期日志和性能数据保存为一个 ZIP。</p>
      </div>

      <div class="rounded-xl border border-dark-700 bg-dark-850 p-5 space-y-5">
        <div class="text-xs">设备：<span class="font-mono text-brand">{{ deviceStore.selectedSerial || '未选择设备' }}</span></div>
        <label class="block text-xs text-gray-400">
          日志时间范围
          <select v-model.number="lastMinutes" class="mt-2 block w-full rounded border border-dark-700 bg-dark-900 px-3 py-2 text-gray-200">
            <option :value="5">最近 5 分钟</option>
            <option :value="15">最近 15 分钟</option>
            <option :value="30">最近 30 分钟</option>
            <option :value="60">最近 60 分钟</option>
          </select>
        </label>
        <label class="flex items-start gap-3 text-xs text-gray-300">
          <input v-model="includeBugreport" type="checkbox" class="mt-0.5 accent-emerald-500" />
          <span>附加 Android bugreport <span class="block mt-1 text-gray-500">包含更完整的系统诊断信息，采集可能需要数分钟。</span></span>
        </label>
        <button
          :disabled="!deviceStore.isOnline || isCapturing"
          @click="capture"
          class="rounded bg-brand px-4 py-2 text-xs font-semibold text-dark-900 disabled:opacity-40"
        >{{ isCapturing ? '正在采集并压缩…' : '采集并保存 ZIP' }}</button>
      </div>

      <div v-if="errorMessage" class="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{{ errorMessage }}</div>
      <div v-if="result" class="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs space-y-2">
        <div>已保存：<span class="font-mono break-all">{{ result.path }}</span></div>
        <div v-for="warning in result.warnings" :key="warning" class="text-amber-300">{{ warning }}</div>
      </div>
      <div class="rounded-xl border border-dark-700 bg-dark-850 p-5 space-y-4 text-xs">
        <div class="font-semibold text-sm">自动采集规则</div>
        <p class="text-gray-500">基于现有实时日志触发；同一设备按冷却时间限制频率，不额外扫描 ADB。</p>
        <div class="flex gap-2 items-center"><button @click="chooseFolder" class="rounded border border-dark-700 px-3 py-2">选择保存目录</button><span class="min-w-0 truncate text-gray-400">{{ rules.folder || '未选择' }}</span></div>
        <label class="flex gap-2"><input v-model="rules.onIncident" @change="rules.persist()" type="checkbox" />检测到崩溃或 ANR 时采集</label>
        <label class="block">日志关键字（可选）<input v-model="rules.keyword" @change="rules.persist()" class="mt-1 block w-full rounded border border-dark-700 bg-dark-900 p-2" placeholder="例如 OutOfMemoryError" /></label>
        <label class="block">同设备冷却时间 <select v-model.number="rules.cooldownSeconds" @change="rules.persist()" class="ml-2 rounded border border-dark-700 bg-dark-900 p-2"><option :value="60">1 分钟</option><option :value="300">5 分钟</option><option :value="900">15 分钟</option></select></label>
        <label class="flex gap-2"><input v-model="rules.enabled" :disabled="!rules.folder" @change="rules.persist()" type="checkbox" />启用自动采集 {{ rules.busy ? '· 正在采集' : '' }}</label>
        <div v-for="item in rules.results" :key="item.at" class="border-t border-dark-700 pt-2 text-gray-400">{{ new Date(item.at).toLocaleString() }} · {{ item.serial }} · {{ item.reason }}<div :class="item.error ? 'text-red-300' : 'text-brand'" class="break-all">{{ item.error || item.path }}</div></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDeviceStore } from '../stores/device'
import { usePerfStore } from '../stores/perf'
import { useCaptureRulesStore } from '../stores/capture-rules'

const deviceStore = useDeviceStore()
const perfStore = usePerfStore()
const rules = useCaptureRulesStore()
async function chooseFolder(): Promise<void> {
  const folder = await window.electronAPI.showOpenDialogDirectory()
  if (folder) { rules.folder = folder; rules.persist() }
}
const lastMinutes = ref(5)
const includeBugreport = ref(false)
const isCapturing = ref(false)
const errorMessage = ref('')
const result = ref<{ path: string; warnings: string[] } | null>(null)

async function capture(): Promise<void> {
  const serial = deviceStore.selectedSerial
  if (!serial || !deviceStore.isOnline || isCapturing.value) return
  const destination = await window.electronAPI.showSaveDialog(`ADBlog-diagnostics-${Date.now()}.zip`)
  if (!destination) return
  isCapturing.value = true
  errorMessage.value = ''
  result.value = null
  try {
    result.value = await window.electronAPI.createDiagnosticBundle({
      serial, destination, lastMinutes: lastMinutes.value,
      includeBugreport: includeBugreport.value,
      perfSamples: perfStore.getHistoryForDevice(serial)
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    isCapturing.value = false
  }
}
</script>
