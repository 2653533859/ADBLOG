<template>
  <div class="flex-1 min-h-0 flex flex-col gap-4 bg-dark-900 p-5 text-gray-200">
    <div><h1 class="text-lg font-semibold">关联时间轴</h1><p class="text-xs text-gray-500 mt-1">将异常、日志标记、录屏与性能采样按发生时间对齐。</p></div>
    <div v-if="!items.length" class="flex-1 flex items-center justify-center text-sm text-gray-500">当前设备尚无时间轴事件</div>
    <div v-else class="flex-1 min-h-0 grid grid-cols-[minmax(260px,40%)_1fr] gap-4">
      <div class="overflow-y-auto rounded border border-dark-700 bg-dark-850">
        <button v-for="item in items" :key="item.id" @click="selectedId = item.id" class="block w-full border-b border-dark-700 p-3 text-left text-xs hover:bg-dark-800" :class="selected?.id === item.id ? 'bg-dark-800' : ''">
          <div class="font-medium text-brand">{{ item.title }}</div><div class="mt-1 text-gray-500">{{ new Date(item.at).toLocaleString() }} · {{ item.kind }}</div>
        </button>
      </div>
      <div v-if="selected" class="min-h-0 overflow-y-auto rounded border border-dark-700 bg-dark-850 p-4 space-y-4 text-xs">
        <div class="text-white font-semibold">{{ selected.title }}</div>
        <div class="text-gray-500">{{ new Date(selected.at).toLocaleString() }}</div>
        <div v-if="selected.detail" class="whitespace-pre-wrap break-all text-gray-300">{{ selected.detail }}</div>
        <div v-if="nearestSample" class="rounded border border-dark-700 p-3">附近性能采样（相差 {{ Math.round(Math.abs(nearestSample.timestamp - selected.at) / 1000) }} 秒）：CPU {{ nearestSample.cpu.appPercent }}% · 内存 {{ nearestSample.memory.totalPss }} KB · FPS {{ nearestSample.fps.currentFps }}</div>
        <div class="font-semibold">附近日志（±5 秒）</div>
        <div v-if="!nearbyLogs.length" class="text-gray-500">当前实时缓冲区没有附近日志</div>
        <div v-for="entry in nearbyLogs" :key="entry.id" class="font-mono border-b border-dark-700 pb-1 break-all"><span class="text-gray-500">{{ entry.timestamp }}</span> {{ entry.tag }}: {{ entry.message }}</div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDeviceStore } from '../stores/device'
import { useLogcatStore } from '../stores/logcat'
import { useIncidentStore } from '../stores/incidents'
import { useTimelineStore } from '../stores/timeline'
import { usePerfStore } from '../stores/perf'
import { logTimestampToEpoch } from '../utils/incident-detection'

const devices = useDeviceStore()
const logcat = useLogcatStore()
const incidents = useIncidentStore()
const timeline = useTimelineStore()
const perf = usePerfStore()
const selectedId = ref('')
const items = computed(() => {
  const serial = devices.selectedSerial
  if (!serial) return []
  return [...timeline.forDevice(serial).map(event => ({ ...event, detail: event.detail || '' })),
    ...incidents.forDevice(serial).map(event => ({ id: event.id, at: event.occurredAt, kind: event.kind,
      title: event.title, detail: event.excerpt.join('\n') }))].sort((a, b) => b.at - a.at)
})
const selected = computed(() => items.value.find(item => item.id === selectedId.value) || items.value[0])
const nearbyLogs = computed(() => {
  if (!selected.value || logcat.currentSerial !== devices.selectedSerial) return []
  return logcat.entries.filter(entry => Math.abs(logTimestampToEpoch(entry.timestamp, selected.value!.at) - selected.value!.at) <= 5000).slice(0, 100)
})
const nearestSample = computed(() => {
  const serial = devices.selectedSerial
  if (!serial || !selected.value) return null
  const samples = perf.getHistoryForDevice(serial)
  const nearest = samples.reduce<(typeof samples)[number] | null>((best, sample) =>
    !best || Math.abs(sample.timestamp - selected.value!.at) < Math.abs(best.timestamp - selected.value!.at) ? sample : best, null)
  return nearest && Math.abs(nearest.timestamp - selected.value.at) <= 10000 ? nearest : null
})
</script>
