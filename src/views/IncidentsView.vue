<template>
  <div class="flex-1 min-h-0 bg-dark-900 text-gray-200 p-5 flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <div><h1 class="text-lg font-semibold">异常事件中心</h1>
        <p class="text-xs text-gray-500 mt-1">从当前设备的实时日志识别 Java 崩溃、ANR 和原生崩溃。</p></div>
      <span class="text-xs text-gray-500">{{ serial || '未选择设备' }}</span>
    </div>
    <div class="flex gap-3 text-xs">
      <select v-model="kind" class="bg-dark-850 border border-dark-700 rounded px-3 py-2">
        <option value="all">全部类型</option><option value="crash">Java 崩溃</option>
        <option value="anr">ANR</option><option value="native-crash">原生崩溃</option>
      </select>
      <span class="self-center text-gray-500">{{ events.length }} 次事件 · {{ groups.length }} 类签名</span>
    </div>
    <div v-if="!events.length" class="flex-1 flex items-center justify-center text-sm text-gray-500">目前没有检测到异常事件</div>
    <div v-else class="min-h-0 flex-1 grid grid-cols-[minmax(240px,38%)_1fr] gap-4">
      <div class="overflow-y-auto rounded border border-dark-700 bg-dark-850">
        <button v-for="group in groups" :key="group.key" @click="selectedId = group.latest.id"
          class="block w-full border-b border-dark-700 p-3 text-left hover:bg-dark-800" :class="selectedId === group.latest.id ? 'bg-dark-800' : ''">
          <div class="flex justify-between gap-2 text-xs"><span class="text-brand font-medium truncate">{{ group.signature }}</span><span class="text-gray-500">×{{ group.count }}</span></div>
          <div class="mt-1 text-[11px] text-gray-500">{{ label(group.latest.kind) }} · {{ new Date(group.latest.occurredAt).toLocaleString() }}</div>
        </button>
      </div>
      <div v-if="selected" class="min-h-0 flex flex-col rounded border border-dark-700 bg-dark-850">
        <div class="p-4 border-b border-dark-700 text-xs space-y-2">
          <div class="font-semibold text-white">{{ selected.title }}</div>
          <div class="text-gray-500">PID {{ selected.pid }} · {{ new Date(selected.occurredAt).toLocaleString() }}</div>
          <button :disabled="saving || !deviceStore.isOnline" @click="capture(selected)"
            class="rounded bg-brand px-3 py-1.5 text-dark-900 font-semibold disabled:opacity-40">{{ saving ? '采集中…' : '保存这次问题的诊断包' }}</button>
          <div v-if="message" class="text-amber-300 break-all">{{ message }}</div>
        </div>
        <pre class="min-h-0 flex-1 overflow-auto p-4 text-[11px] leading-5 text-gray-300 whitespace-pre-wrap break-all">{{ selected.excerpt.join('\n') }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useIncidentStore } from '../stores/incidents'
import { useDeviceStore } from '../stores/device'
import { usePerfStore } from '../stores/perf'
import type { IncidentEvent } from '../types'

const incidentStore = useIncidentStore()
const deviceStore = useDeviceStore()
const perfStore = usePerfStore()
const kind = ref('all')
const selectedId = ref('')
const saving = ref(false)
const message = ref('')
const serial = computed(() => deviceStore.selectedSerial)
const events = computed(() => serial.value ? incidentStore.forDevice(serial.value)
  .filter(event => kind.value === 'all' || event.kind === kind.value) : [])
const groups = computed(() => {
  const map = new Map<string, { key: string; signature: string; count: number; latest: IncidentEvent }>()
  for (const event of events.value) {
    const key = `${event.kind}:${event.signature}`
    const existing = map.get(key)
    if (existing) existing.count += 1
    else map.set(key, { key, signature: event.signature, count: 1, latest: event })
  }
  return [...map.values()]
})
const selected = computed(() => events.value.find(event => event.id === selectedId.value) || groups.value[0]?.latest)
function label(value: string): string { return value === 'anr' ? 'ANR' : value === 'crash' ? 'Java 崩溃' : '原生崩溃' }
async function capture(event: IncidentEvent): Promise<void> {
  if (saving.value || deviceStore.selectedSerial !== event.serial) return
  const destination = await window.electronAPI.showSaveDialog(`ADBlog-incident-${Date.now()}.zip`)
  if (!destination) return
  saving.value = true
  message.value = ''
  try {
    const result = await window.electronAPI.createDiagnosticBundle({ serial: event.serial, destination,
      lastMinutes: 5, includeBugreport: false, perfSamples: perfStore.getHistoryForDevice(event.serial) })
    message.value = `已保存：${result.path}${result.warnings.length ? `；${result.warnings.join('；')}` : ''}`
  } catch (error) { message.value = error instanceof Error ? error.message : String(error) }
  finally { saving.value = false }
}
</script>
