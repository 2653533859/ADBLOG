<template>
  <div class="flex-1 flex flex-col h-full bg-dark-900 overflow-hidden select-none">
    <!-- Top Control Bar -->
    <div class="h-12 bg-dark-850 border-b border-dark-700 px-4 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <span class="text-xs font-semibold text-white flex items-center gap-1.5">
          <Activity class="w-4 h-4 text-brand" />
          <span>设备与应用性能监控看板</span>
        </span>

        <span v-if="deviceStore.selectedPackage" class="text-xs text-gray-300 bg-dark-800 px-2.5 py-1 rounded border border-dark-700">
          目标应用: <strong class="text-brand">{{ deviceStore.selectedPackage }}</strong>
        </span>

        <span v-else class="text-xs text-gray-500">
          (未选择应用，正在监控系统全局指标)
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="toggleMonitoring"
          :disabled="!deviceStore.isOnline"
          class="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
          :class="perfStore.isMonitoring ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-brand hover:bg-brand-hover text-white'"
        >
          <Square v-if="perfStore.isMonitoring" class="w-3.5 h-3.5" />
          <Play v-else class="w-3.5 h-3.5" />
          <span>{{ perfStore.isMonitoring ? '停止监控' : '开启监控' }}</span>
        </button>

        <button
          @click="perfStore.exportCsv"
          :disabled="perfStore.history.length === 0"
          class="px-3 py-1.5 bg-dark-800 hover:bg-dark-750 border border-dark-700 text-gray-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
        >
          <Download class="w-3.5 h-3.5" />
          <span>导出 CSV 报表</span>
        </button>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- 4 Top Stat Cards -->
      <div class="grid grid-cols-4 gap-4">
        <!-- CPU Card -->
        <div class="bg-dark-850 border border-dark-700 rounded-xl p-4">
          <div class="text-xs text-gray-400 mb-1 flex items-center justify-between">
            <span>CPU 占用率</span>
            <Cpu class="w-4 h-4 text-brand" />
          </div>
          <div class="text-2xl font-bold font-mono text-white">
            {{ perfStore.currentSample?.cpu.appPercent ?? '--' }}<span class="text-xs text-gray-400">%</span>
          </div>
          <div class="text-[11px] text-gray-500 mt-1">
            系统总占用: <span class="text-gray-300 font-mono">{{ perfStore.currentSample?.cpu.systemPercent ?? '--' }}%</span>
          </div>
        </div>

        <!-- Memory Card -->
        <div class="bg-dark-850 border border-dark-700 rounded-xl p-4">
          <div class="text-xs text-gray-400 mb-1 flex items-center justify-between">
            <span>内存 PSS 消耗</span>
            <Layers class="w-4 h-4 text-emerald-400" />
          </div>
          <div class="text-2xl font-bold font-mono text-white">
            {{ formatMem(perfStore.currentSample?.memory.totalPss) }}
          </div>
          <div class="text-[11px] text-gray-500 mt-1">
            Native: <span class="text-gray-300 font-mono">{{ formatMem(perfStore.currentSample?.memory.nativeHeapPss) }}</span>
            | Java: <span class="text-gray-300 font-mono">{{ formatMem(perfStore.currentSample?.memory.javaHeapPss) }}</span>
          </div>
        </div>

        <!-- Network Card -->
        <div class="bg-dark-850 border border-dark-700 rounded-xl p-4">
          <div class="text-xs text-gray-400 mb-1 flex items-center justify-between">
            <span>网络吞吐速率</span>
            <Network class="w-4 h-4 text-cyan-400" />
          </div>
          <div class="text-2xl font-bold font-mono text-white">
            {{ formatSpeed(perfStore.currentSample?.network.rxBytesPerSec) }}
          </div>
          <div class="text-[11px] text-gray-500 mt-1">
            上传速率: <span class="text-gray-300 font-mono">{{ formatSpeed(perfStore.currentSample?.network.txBytesPerSec) }}</span>
          </div>
        </div>

        <!-- Battery Card -->
        <div class="bg-dark-850 border border-dark-700 rounded-xl p-4">
          <div class="text-xs text-gray-400 mb-1 flex items-center justify-between">
            <span>电池与温度</span>
            <BatteryCharging class="w-4 h-4 text-amber-400" />
          </div>
          <div class="text-2xl font-bold font-mono text-white">
            {{ perfStore.currentSample?.battery.level ?? '--' }}<span class="text-xs text-gray-400">%</span>
          </div>
          <div class="text-[11px] text-gray-500 mt-1">
            当前温度: <span class="text-gray-300 font-mono">{{ perfStore.currentSample?.battery.temperature ?? '--' }}°C</span>
          </div>
        </div>
      </div>

      <!-- Charts Section -->
      <div class="grid grid-cols-2 gap-4">
        <!-- CPU Trend Chart -->
        <div class="bg-dark-850 border border-dark-700 rounded-xl p-4 flex flex-col h-72">
          <div class="text-xs font-semibold text-white mb-2 flex items-center justify-between">
            <span>CPU 使用率历史趋势 (最近 60 秒)</span>
            <span class="text-[10px] text-gray-500">蓝色: 目标应用 / 灰色: 系统全局</span>
          </div>
          <div ref="cpuChartRef" class="flex-1 w-full"></div>
        </div>

        <!-- Memory Trend Chart -->
        <div class="bg-dark-850 border border-dark-700 rounded-xl p-4 flex flex-col h-72">
          <div class="text-xs font-semibold text-white mb-2 flex items-center justify-between">
            <span>内存构成细分 (PSS)</span>
            <span class="text-[10px] text-gray-500">堆内存与图形显存分布</span>
          </div>
          <div ref="memChartRef" class="flex-1 w-full"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import {
  Activity,
  Play,
  Square,
  Download,
  Cpu,
  Layers,
  Network,
  BatteryCharging
} from 'lucide-vue-next'
import * as echarts from 'echarts'
import { usePerfStore } from '../stores/perf'
import { useDeviceStore } from '../stores/device'
import { PerfMetricsSample } from '../types'

const perfStore = usePerfStore()
const deviceStore = useDeviceStore()

const cpuChartRef = ref<HTMLDivElement | null>(null)
const memChartRef = ref<HTMLDivElement | null>(null)

let cpuChart: echarts.ECharts | null = null
let memChart: echarts.ECharts | null = null

function toggleMonitoring(): void {
  if (perfStore.isMonitoring) {
    perfStore.stopMonitoring()
  } else if (deviceStore.selectedSerial) {
    perfStore.startMonitoring(deviceStore.selectedSerial, deviceStore.selectedPackage)
  }
}

function initCharts(): void {
  if (cpuChartRef.value) {
    cpuChart = echarts.init(cpuChartRef.value, 'dark')
    cpuChart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, top: 20, bottom: 25 },
      xAxis: {
        type: 'category',
        data: [],
        axisLine: { lineStyle: { color: '#383a48' } },
        axisLabel: { color: '#6b7280', fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        max: 100,
        axisLine: { lineStyle: { color: '#383a48' } },
        splitLine: { lineStyle: { color: '#1f2937' } },
        axisLabel: { color: '#6b7280', fontSize: 10, formatter: '{value}%' }
      },
      series: [
        {
          name: '应用占用',
          type: 'line',
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#3b82f6', width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#3b82f640' },
              { offset: 1, color: '#3b82f605' }
            ])
          },
          data: []
        },
        {
          name: '系统总计',
          type: 'line',
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#6b7280', width: 1.5, type: 'dashed' },
          data: []
        }
      ]
    })
  }

  if (memChartRef.value) {
    memChart = echarts.init(memChartRef.value, 'dark')
    memChart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 50, right: 20, top: 20, bottom: 25 },
      xAxis: {
        type: 'category',
        data: [],
        axisLine: { lineStyle: { color: '#383a48' } },
        axisLabel: { color: '#6b7280', fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#383a48' } },
        splitLine: { lineStyle: { color: '#1f2937' } },
        axisLabel: { color: '#6b7280', fontSize: 10, formatter: (val: number) => `${Math.round(val / 1024)}MB` }
      },
      series: [
        {
          name: 'Java Heap',
          type: 'line',
          stack: 'Total',
          showSymbol: false,
          areaStyle: {},
          lineStyle: { width: 1 },
          data: []
        },
        {
          name: 'Native Heap',
          type: 'line',
          stack: 'Total',
          showSymbol: false,
          areaStyle: {},
          lineStyle: { width: 1 },
          data: []
        },
        {
          name: 'Graphics',
          type: 'line',
          stack: 'Total',
          showSymbol: false,
          areaStyle: {},
          lineStyle: { width: 1 },
          data: []
        }
      ]
    })
  }

  window.addEventListener('resize', handleResize)
}

function handleResize(): void {
  cpuChart?.resize()
  memChart?.resize()
}

watch(
  () => perfStore.history.slice(),
  () => {
    if (!cpuChart || !memChart) return

    const labels = perfStore.history.map((s: PerfMetricsSample) => new Date(s.timestamp).toLocaleTimeString())
    const appCpu = perfStore.history.map((s: PerfMetricsSample) => s.cpu.appPercent)
    const sysCpu = perfStore.history.map((s: PerfMetricsSample) => s.cpu.systemPercent)

    const javaHeap = perfStore.history.map((s: PerfMetricsSample) => s.memory.javaHeapPss)
    const nativeHeap = perfStore.history.map((s: PerfMetricsSample) => s.memory.nativeHeapPss)
    const graphics = perfStore.history.map((s: PerfMetricsSample) => s.memory.graphicsPss)

    cpuChart.setOption({
      xAxis: { data: labels },
      series: [
        { data: appCpu },
        { data: sysCpu }
      ]
    })

    memChart.setOption({
      xAxis: { data: labels },
      series: [
        { data: javaHeap },
        { data: nativeHeap },
        { data: graphics }
      ]
    })
  }
)

watch(() => [deviceStore.selectedSerial, deviceStore.selectedPackage], () => {
  const restart = perfStore.isMonitoring
  perfStore.stopMonitoring()
  perfStore.clearHistory()
  if (restart && deviceStore.selectedSerial) {
    perfStore.startMonitoring(deviceStore.selectedSerial, deviceStore.selectedPackage)
  }
})

onMounted(() => {
  initCharts()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  cpuChart?.dispose()
  memChart?.dispose()
})

function formatMem(kb?: number): string {
  if (!kb) return '--'
  const mb = Math.round(kb / 1024)
  return `${mb} MB`
}

function formatSpeed(bps?: number): string {
  if (!bps) return '0 KB/s'
  if (bps < 1024 * 1024) {
    return `${Math.round(bps / 1024)} KB/s`
  }
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}
</script>
