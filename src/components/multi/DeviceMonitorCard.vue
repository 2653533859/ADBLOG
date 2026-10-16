<template>
  <article class="flex flex-col overflow-hidden rounded-xl border border-dark-700 bg-dark-850 text-gray-200"
    :class="expanded ? 'fixed inset-5 z-50 shadow-2xl' : 'h-[min(70vh,720px)] min-h-[440px]'">
    <header class="shrink-0 flex items-center gap-2 border-b border-dark-700 px-3 py-2 text-xs">
      <span class="w-2 h-2 rounded-full" :class="streaming ? 'bg-brand' : 'bg-amber-400'" />
      <span class="font-semibold text-white truncate">{{ model }}</span>
      <span class="font-mono text-gray-500 truncate">{{ serial }}</span>
      <span class="ml-auto text-gray-500 whitespace-nowrap">{{ videoSize.width || '—' }}×{{ videoSize.height || '—' }} · {{ fps }} FPS</span>
      <button v-if="!streaming && !starting" class="rounded border border-dark-700 px-2 py-1 hover:text-white" @click="retry">重连</button>
      <button class="rounded border border-dark-700 px-2 py-1 hover:text-white" @click="expanded = !expanded">{{ expanded ? '缩小' : '放大' }}</button>
      <button class="rounded border border-dark-700 px-2 py-1 text-red-300" @click="emit('remove', serial)">移除</button>
    </header>
    <div class="flex-1 min-h-0 grid" :class="expanded ? 'grid-cols-[minmax(0,62%)_minmax(0,38%)]' : 'grid-cols-[minmax(0,48%)_minmax(0,52%)]'">
      <div class="min-w-0 min-h-0 flex flex-col border-r border-dark-700 bg-[#070a0c]">
        <div ref="videoHost" class="flex-1 min-h-0 overflow-auto flex relative" :class="viewScale ? 'items-start justify-start' : 'items-center justify-center'"
          @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" @contextmenu.prevent>
          <canvas ref="canvas" class="block bg-black flex-none" :style="canvasStyle" />
          <div v-if="!streaming" class="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-gray-500 pointer-events-none">{{ videoError || '正在连接投屏…' }}</div>
        </div>
        <div class="shrink-0 flex items-center gap-2 px-2 py-2 border-t border-dark-700 text-[11px]">
          <select v-model.number="viewScale" class="min-w-0 rounded bg-dark-900 border border-dark-700 px-1.5 py-1 text-gray-300" title="画面比例">
            <option :value="0">适应窗口</option><option :value="1">原始 100%</option><option :value="1.5">放大 150%</option>
          </select>
          <button :disabled="!streaming" @click="command('back')" class="rounded border border-dark-700 px-2 py-1 disabled:opacity-30">返回</button>
          <button :disabled="!streaming" @click="command('home')" class="rounded border border-dark-700 px-2 py-1 disabled:opacity-30">主页</button>
        </div>
      </div>
      <section class="min-w-0 min-h-0 flex flex-col">
        <div class="shrink-0 flex items-center gap-2 border-b border-dark-700 px-2 py-2 text-[11px]">
          <span class="font-semibold text-white">实时日志</span><span class="text-gray-500">{{ logRate }}/秒</span>
          <select v-model="minLevel" class="ml-auto rounded border border-dark-700 bg-dark-900 px-1 py-0.5"><option v-for="level in levels" :key="level" :value="level">{{ level }}+</option></select>
        </div>
        <input v-model="keyword" class="shrink-0 bg-dark-900 border-b border-dark-700 px-2 py-1.5 text-[11px] outline-none" placeholder="搜索当前设备日志（消息或 Tag）" />
        <div class="shrink-0 flex flex-wrap items-center gap-1 border-b border-dark-700 px-2 py-1.5 text-[10px]">
          <span class="mr-auto text-gray-500">匹配 {{ filteredLogs.length }}/{{ entries.length }} · 最近 1000 条</span>
          <button class="rounded border border-dark-700 px-1.5 py-1 hover:text-white" @click="showFilters = !showFilters">{{ showFilters ? '收起筛选' : '更多筛选' }}</button>
          <button class="rounded border border-dark-700 px-1.5 py-1 hover:text-white disabled:opacity-40" :disabled="!filteredLogs.length || Boolean(filterError) || saving" @click="exportFiltered">{{ saving ? '保存中…' : '导出筛选' }}</button>
          <button class="rounded border px-1.5 py-1 disabled:opacity-40" :class="recordingPath ? 'border-red-700 text-red-300' : 'border-dark-700 hover:text-white'" :disabled="recordingPending" @click="toggleRecording">{{ recordingPending ? '处理中…' : recordingPath ? '停止录制' : '录制原始' }}</button>
        </div>
        <div v-if="showFilters" class="shrink-0 grid grid-cols-2 gap-1.5 border-b border-dark-700 p-2 text-[10px]">
          <input v-model="tag" class="min-w-0 rounded border border-dark-700 bg-dark-900 px-2 py-1" placeholder="Tag 包含" />
          <input v-model="pidText" inputmode="numeric" class="min-w-0 rounded border border-dark-700 bg-dark-900 px-2 py-1" placeholder="PID（可选）" />
          <label class="flex items-center gap-1"><input v-model="isRegex" type="checkbox" class="accent-brand" /> 正则表达式</label>
          <label class="flex items-center gap-1"><input v-model="isCaseSensitive" type="checkbox" class="accent-brand" /> 区分大小写</label>
          <button class="col-span-2 justify-self-start text-gray-400 hover:text-white" @click="clearFilters">清除筛选</button>
        </div>
        <div v-if="filterError" class="shrink-0 px-2 py-1 text-[10px] text-red-300">{{ filterError }}</div>
        <div v-if="recordingPath" class="shrink-0 truncate px-2 py-1 text-[10px] text-red-300" :title="recordingPath">● 正在录制原始日志：{{ recordingPath }}</div>
        <div v-if="saveMessage" class="shrink-0 truncate px-2 py-1 text-[10px] text-brand" :title="saveMessage">{{ saveMessage }}</div>
        <div v-if="logError" class="p-2 text-[11px] text-red-300">{{ logError }}</div>
        <div class="flex-1 min-h-0 overflow-y-auto font-mono text-[10px] leading-4">
          <div v-for="entry in visibleLogs" :key="entry.id" class="border-b border-dark-800 px-2 py-1 break-all" :class="entry.level === 'E' || entry.level === 'A' ? 'text-red-300' : 'text-gray-400'">
            <span class="text-gray-600">{{ entry.timestamp }} </span><span class="text-brand">{{ entry.tag }}</span> {{ entry.message }}
          </div>
          <div v-if="!visibleLogs.length" class="p-3 text-gray-600">暂无匹配日志</div>
        </div>
      </section>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, markRaw, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy'
import { WebCodecsVideoDecoder, WebGLVideoFrameRenderer } from '@yume-chan/scrcpy-decoder-webcodecs'
import type { LogcatEntry, LogcatFilterOptions, ScrcpyControlEvent, ScrcpyVideoPacket } from '../../types'
import { filterLogcatEntries } from '../../utils/logcat-filter'

const props = defineProps<{ serial: string; model: string; maxSize: number; bitRate: number; maxFps: number }>()
const emit = defineEmits<{ (e: 'remove', serial: string): void }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const videoHost = ref<HTMLElement | null>(null)
const expanded = ref(false)
const viewScale = ref(0)
const streaming = ref(false)
const starting = ref(false)
const videoError = ref('')
const logError = ref('')
const videoSize = ref({ width: 0, height: 0 })
const fps = ref(0)
const logRate = ref(0)
const entries = ref<LogcatEntry[]>([])
const keyword = ref('')
const tag = ref('')
const pidText = ref('')
const isRegex = ref(false)
const isCaseSensitive = ref(false)
const showFilters = ref(false)
const minLevel = ref<LogcatEntry['level']>('V')
const levels = ['V', 'D', 'I', 'W', 'E', 'A'] as const
const pidError = computed(() => pidText.value && (!/^[1-9]\d*$/.test(pidText.value) || !Number.isSafeInteger(Number(pidText.value))) ? 'PID 请输入正整数。' : '')
const regexError = computed(() => {
  if (!isRegex.value || !keyword.value) return ''
  try { new RegExp(keyword.value, isCaseSensitive.value ? '' : 'i'); return '' }
  catch (error) { return `正则表达式无效：${error instanceof Error ? error.message : String(error)}` }
})
const filterError = computed(() => pidError.value || regexError.value)
const filter = computed<LogcatFilterOptions>(() => ({
  targetPids: null, pid: pidText.value && !pidError.value ? Number(pidText.value) : null,
  minLevel: minLevel.value, keyword: keyword.value, isRegex: isRegex.value,
  isCaseSensitive: isCaseSensitive.value, tag: tag.value.trim(), excludeTags: []
}))
const filteredLogs = computed(() => filterError.value ? [] : filterLogcatEntries(entries.value, filter.value).entries)
const visibleLogs = computed(() => filteredLogs.value.slice(-80))
const recordingPath = ref<string | null>(null)
const recordingPending = ref(false)
const saving = ref(false)
const saveMessage = ref('')
const canvasStyle = computed(() => viewScale.value && videoSize.value.width ? {
  width: `${Math.round(videoSize.value.width * viewScale.value)}px`,
  height: `${Math.round(videoSize.value.height * viewScale.value)}px`, maxWidth: 'none', maxHeight: 'none'
} : { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' })

let decoder: WebCodecsVideoDecoder | null = null
type DecoderWriter = ReturnType<WebCodecsVideoDecoder['writable']['getWriter']>
let session: { writer: DecoderWriter; chain: Promise<void> } | null = null
let active = false
let shouldRun = false
let lifecycle = Promise.resolve()
let generation = 0
let hasDeactivated = false
let statsTimer = 0
let lastFrameCount = 0
let pendingLogCount = 0
let pointerDown = false
const unsubscribers: Array<() => void> = []
function queueLifecycle(task: () => Promise<void>): void {
  lifecycle = lifecycle.then(task, task)
}
function clearFilters(): void {
  minLevel.value = 'V'
  keyword.value = ''
  tag.value = ''
  pidText.value = ''
  isRegex.value = false
  isCaseSensitive.value = false
}
function defaultLogName(suffix: string): string {
  return `ADBlog-${props.serial.replace(/[^a-z0-9._-]/gi, '_')}-${Date.now()}-${suffix}.log`
}
async function exportFiltered(): Promise<void> {
  if (saving.value || filterError.value) return
  const snapshot = filteredLogs.value.map(entry => entry.raw)
  if (!snapshot.length) return
  saving.value = true
  saveMessage.value = ''
  try {
    const path = await window.electronAPI.showSaveDialog(defaultLogName('filtered'))
    if (!path) return
    await window.electronAPI.writeTextFile(path, `${snapshot.join('\n')}\n`)
    saveMessage.value = `已导出 ${snapshot.length} 条筛选日志：${path}`
  } catch (error) {
    logError.value = `导出失败：${error instanceof Error ? error.message : String(error)}`
  } finally {
    saving.value = false
  }
}
async function toggleRecording(): Promise<void> {
  if (recordingPending.value) return
  recordingPending.value = true
  saveMessage.value = ''
  try {
    if (recordingPath.value) {
      const path = recordingPath.value
      await window.electronAPI.stopMultiLogcatRecording(props.serial)
      recordingPath.value = null
      saveMessage.value = `原始日志已保存：${path}`
      return
    }
    const path = await window.electronAPI.showSaveDialog(defaultLogName('raw'))
    if (!path || !active) return
    const started = await window.electronAPI.startMultiLogcatRecording(props.serial, path)
    if (!active && started) await window.electronAPI.stopMultiLogcatRecording(props.serial)
    if (active && started) recordingPath.value = path
    else if (active) logError.value = '日志录制启动失败，请检查设备连接和保存路径。'
  } catch (error) {
    logError.value = `日志录制失败：${error instanceof Error ? error.message : String(error)}`
  } finally {
    recordingPending.value = false
    if (!shouldRun && !recordingPath.value) queueLifecycle(stop)
  }
}

function setupDecoder(): void {
  if (!canvas.value || !WebCodecsVideoDecoder.isSupported) throw new Error('当前环境不支持 WebCodecs 视频解码。')
  const renderer = new WebGLVideoFrameRenderer(canvas.value, false)
  decoder = new WebCodecsVideoDecoder({ codec: ScrcpyVideoCodecId.H264, renderer })
  session = { writer: decoder.writable.getWriter(), chain: Promise.resolve() }
  decoder.sizeChanged(size => { videoSize.value = size })
}
function disposeDecoder(): void {
  const current = session
  session = null
  try { current?.writer.releaseLock() } catch { /* pending packets are discarded */ }
  decoder?.dispose()
  decoder = null
  videoSize.value = { width: 0, height: 0 }
  fps.value = 0
  lastFrameCount = 0
}
function receivePacket(serial: string, packet: ScrcpyVideoPacket): void {
  if (!active || serial !== props.serial || !session) return
  const current = session
  const parsed = packet.type === 'configuration'
    ? { type: 'configuration' as const, data: new Uint8Array(packet.data) }
    : { type: 'data' as const, data: new Uint8Array(packet.data), keyframe: packet.keyframe,
        pts: packet.pts === undefined ? undefined : BigInt(packet.pts) }
  current.chain = current.chain.then(async () => {
    if (session === current) await current.writer.write(parsed)
  }).catch(error => {
    if (session === current) videoError.value = `解码失败：${error instanceof Error ? error.message : String(error)}`
  })
}
async function start(): Promise<void> {
  if (active || !shouldRun || !window.electronAPI) return
  active = true
  starting.value = true
  const token = ++generation
  videoError.value = ''
  logError.value = ''
  entries.value = []
  try { await window.electronAPI.startMultiLogcat(props.serial) }
  catch (error) { if (token === generation) logError.value = error instanceof Error ? error.message : String(error) }
  if (token !== generation || !shouldRun) { starting.value = false; return }
  await startMirror(token)
}
async function startMirror(token: number): Promise<void> {
  try {
    setupDecoder()
    const result = await window.electronAPI.startMultiScrcpy(props.serial, {
      maxSize: props.maxSize, bitRate: props.bitRate, maxFps: props.maxFps, stayAwake: true, turnScreenOff: false
    })
    if (token !== generation || !shouldRun) return
    if (!result.success) throw new Error(result.message)
    streaming.value = true
  } catch (error) {
    if (token === generation) { videoError.value = error instanceof Error ? error.message : String(error); disposeDecoder() }
  } finally {
    starting.value = false
  }
}
async function restartMirror(): Promise<void> {
  if (!active || !shouldRun) return
  const token = ++generation
  streaming.value = false
  starting.value = true
  videoError.value = ''
  try {
    await window.electronAPI.stopMultiScrcpy(props.serial)
    disposeDecoder()
    if (token === generation && shouldRun) await startMirror(token)
    else starting.value = false
  } catch (error) {
    if (token === generation) videoError.value = `重启投屏失败：${error instanceof Error ? error.message : String(error)}`
    starting.value = false
  }
}
async function pauseMirror(): Promise<void> {
  streaming.value = false
  starting.value = false
  pointerDown = false
  expanded.value = false
  await window.electronAPI.stopMultiScrcpy(props.serial)
  disposeDecoder()
}
async function stop(): Promise<void> {
  if (!active) return
  active = false
  ++generation
  streaming.value = false
  starting.value = false
  pointerDown = false
  expanded.value = false
  if (recordingPath.value) saveMessage.value = `原始日志已保存：${recordingPath.value}`
  recordingPath.value = null
  disposeDecoder()
  await Promise.allSettled([window.electronAPI.stopMultiScrcpy(props.serial), window.electronAPI.stopMultiLogcat(props.serial)])
}
function pointFromEvent(event: PointerEvent): ScrcpyControlEvent & { type: 'touch' } | null {
  if (!canvas.value || !videoSize.value.width) return null
  const rect = canvas.value.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return { type: 'touch', action: 'move', x: Math.max(0, Math.min(videoSize.value.width - 1,
    (event.clientX - rect.left) / rect.width * videoSize.value.width)),
    y: Math.max(0, Math.min(videoSize.value.height - 1,
      (event.clientY - rect.top) / rect.height * videoSize.value.height)),
    width: videoSize.value.width, height: videoSize.value.height }
}
function send(event: ScrcpyControlEvent): void { if (streaming.value) void window.electronAPI.sendMultiScrcpyControl(props.serial, event) }
function onPointerDown(event: PointerEvent): void {
  if (!streaming.value || event.button !== 0 || event.target !== canvas.value) return
  const point = pointFromEvent(event)
  if (!point) return
  pointerDown = true
  videoHost.value?.setPointerCapture(event.pointerId)
  send({ ...point, action: 'down' })
}
function onPointerMove(event: PointerEvent): void {
  if (!pointerDown) return
  const point = pointFromEvent(event)
  if (point) send({ ...point, action: 'move' })
}
function onPointerUp(event: PointerEvent): void {
  if (!pointerDown) return
  pointerDown = false
  const point = pointFromEvent(event)
  if (point) send({ ...point, action: 'up' })
}
function command(value: 'home' | 'back'): void { send({ type: 'command', command: value }) }
function retry(): void { queueLifecycle(async () => { if (recordingPath.value) await restartMirror(); else { await stop(); await start() } }) }

onMounted(() => {
  unsubscribers.push(window.electronAPI.onMultiScrcpyPacket(receivePacket))
  unsubscribers.push(window.electronAPI.onMultiScrcpySize((serial, size) => {
    if (active && serial === props.serial) videoSize.value = size
  }))
  unsubscribers.push(window.electronAPI.onMultiScrcpyStopped((serial, message) => {
    if (!active || serial !== props.serial) return
    streaming.value = false
    disposeDecoder()
    videoError.value = message
  }))
  unsubscribers.push(window.electronAPI.onMultiLogcatBatch((serial, batch) => {
    if (!active || serial !== props.serial) return
    pendingLogCount += batch.length
    entries.value.push(...batch.map(entry => markRaw(entry)))
    if (entries.value.length > 1000) entries.value.splice(0, entries.value.length - 1000)
  }))
  unsubscribers.push(window.electronAPI.onMultiLogcatRecordingError((serial, message) => {
    if (serial !== props.serial) return
    recordingPath.value = null
    logError.value = `日志录制失败：${message}`
    if (!shouldRun) queueLifecycle(stop)
  }))
  statsTimer = window.setInterval(() => {
    const count = decoder?.framesRendered || 0
    fps.value = count - lastFrameCount
    lastFrameCount = count
    logRate.value = pendingLogCount
    pendingLogCount = 0
  }, 1000)
  shouldRun = true
  queueLifecycle(start)
})
onActivated(() => { if (hasDeactivated) { shouldRun = true; queueLifecycle(async () => { if (active) await restartMirror(); else await start() }) } })
onDeactivated(() => {
  hasDeactivated = true
  shouldRun = false
  ++generation
  queueLifecycle(recordingPath.value || recordingPending.value ? pauseMirror : stop)
})
onUnmounted(() => {
  shouldRun = false
  ++generation
  queueLifecycle(stop)
  unsubscribers.forEach(unsubscribe => unsubscribe())
  window.clearInterval(statsTimer)
})
watch(() => [props.maxSize, props.bitRate, props.maxFps], () => {
  if (active) queueLifecycle(restartMirror)
})
</script>
