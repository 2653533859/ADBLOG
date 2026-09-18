<template>
  <div class="flex-1 flex flex-col h-full bg-dark-900 overflow-hidden select-none">
    <header class="h-14 bg-dark-850 border-b border-dark-700 px-4 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <Smartphone class="w-4 h-4 text-brand" />
        <span class="text-xs font-semibold text-white">设备投屏与交互控制</span>
        <span v-if="isStreaming" class="status-pill">
          <span class="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
          内嵌 · {{ videoSize.width }}×{{ videoSize.height }} · {{ renderedFps }} FPS
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button class="icon-button" :disabled="!isStreaming" title="旋转设备" @click="command('rotate')"><RotateCw /></button>
        <button class="icon-button" :disabled="!isStreaming" title="保存当前画面" @click="captureScreenshot"><Camera /></button>
        <button v-if="!isStreaming" class="primary-button" :disabled="!deviceStore.isOnline || isStarting" @click="startStreaming">
          <Loader2 v-if="isStarting" class="animate-spin" /><Play v-else />
          {{ isStarting ? '正在建立视频通道' : '开始投屏' }}
        </button>
        <button v-else class="stop-button" @click="stopStreaming"><Square />停止投屏</button>
      </div>
    </header>

    <main class="flex-1 min-h-0 flex">
      <section class="flex-1 min-w-0 relative flex items-center justify-center bg-[#070a0c] p-5">
        <div v-if="!isStreaming" class="empty-state">
          <div class="w-16 h-16 rounded-2xl border border-brand/30 bg-brand/10 flex items-center justify-center">
            <MonitorUp class="w-7 h-7 text-brand" />
          </div>
          <h2>低延迟内嵌投屏</h2>
          <p>设备端硬件编码 H.264，应用内 WebCodecs 解码并通过 WebGL 显示。点击、拖动、滚轮和键盘输入均走常驻控制连接。</p>
          <div class="font-mono text-[11px] text-gray-500">{{ streamSerial || deviceStore.selectedSerial || '请先选择在线设备' }}</div>
        </div>

        <div
          v-show="isStreaming"
          ref="screenHost"
          class="screen-host"
          tabindex="0"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel.prevent="onWheel"
          @keydown="onKeyDown"
          @keyup="onKeyUp"
          @contextmenu.prevent
        >
          <canvas ref="screenCanvas" />
          <textarea
            ref="inputSink"
            class="input-sink"
            tabindex="-1"
            aria-label="发送文字到 Android 设备"
            @input="onTextInput"
            @compositionstart="isComposing = true"
            @compositionend="onCompositionEnd"
          />
        </div>

        <div v-if="errorMessage" class="absolute left-5 right-5 bottom-5 error-banner">
          <AlertCircle class="w-4 h-4 shrink-0" /><span>{{ errorMessage }}</span>
        </div>
      </section>

      <aside class="w-64 shrink-0 border-l border-dark-700 bg-dark-850 flex flex-col">
        <div class="panel-title">视频参数</div>
        <div class="p-4 space-y-4">
          <label class="setting-row">
            <span>分辨率上限</span>
            <select v-model.number="maxSize" :disabled="isStreaming">
              <option :value="720">720 px</option><option :value="1080">1080 px</option>
              <option :value="1280">1280 px</option><option :value="1920">1920 px</option>
            </select>
          </label>
          <label class="setting-row">
            <span>最高帧率</span>
            <select v-model.number="maxFps" :disabled="isStreaming">
              <option :value="15">15 FPS</option><option :value="30">30 FPS</option><option :value="60">60 FPS</option>
            </select>
          </label>
          <label class="setting-row">
            <span>视频码率</span>
            <select v-model.number="bitRateMbps" :disabled="isStreaming">
              <option :value="2">2 Mbps</option><option :value="4">4 Mbps</option>
              <option :value="6">6 Mbps</option><option :value="8">8 Mbps</option>
            </select>
          </label>
        </div>

        <div class="panel-title border-t border-dark-700">Android 导航</div>
        <div class="p-4 grid grid-cols-3 gap-2">
          <button class="nav-button" :disabled="!isStreaming" title="返回" @click="command('back')"><CornerDownLeft /></button>
          <button class="nav-button" :disabled="!isStreaming" title="主页" @click="command('home')"><Circle /></button>
          <button class="nav-button" :disabled="!isStreaming" title="最近任务" @click="command('app-switch')"><PanelsTopLeft /></button>
        </div>
        <button class="mx-4 nav-button gap-2" :disabled="!isStreaming" @click="command('power')"><Power />电源键</button>

        <div class="mt-auto p-4 border-t border-dark-700 text-[10px] leading-5 text-gray-500">
          <div class="flex items-center gap-2"><MousePointer2 class="hint-icon" />点击、拖动、滚轮</div>
          <div class="flex items-center gap-2"><Keyboard class="hint-icon" />键盘及中文输入</div>
          <div class="flex items-center gap-2"><Cpu class="hint-icon" />WebCodecs 硬件解码</div>
        </div>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  AlertCircle, Camera, Circle, CornerDownLeft, Cpu, Keyboard, Loader2,
  MonitorUp, MousePointer2, PanelsTopLeft, Play, Power, RotateCw, Smartphone, Square
} from 'lucide-vue-next'
import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy'
import { WebCodecsVideoDecoder, WebGLVideoFrameRenderer } from '@yume-chan/scrcpy-decoder-webcodecs'
import type { ScrcpyControlEvent, ScrcpyVideoPacket } from '../types'
import { useDeviceStore } from '../stores/device'

const deviceStore = useDeviceStore()
const screenCanvas = ref<HTMLCanvasElement | null>(null)
const screenHost = ref<HTMLElement | null>(null)
const inputSink = ref<HTMLTextAreaElement | null>(null)
const isStreaming = ref(false)
const isStarting = ref(false)
const errorMessage = ref('')
const maxSize = ref(1280)
const maxFps = ref(30)
const bitRateMbps = ref(6)
const videoSize = ref({ width: 0, height: 0 })
const renderedFps = ref(0)
const streamSerial = ref<string | null>(null)

let decoder: WebCodecsVideoDecoder | null = null
type DecoderWriter = ReturnType<WebCodecsVideoDecoder['writable']['getWriter']>
interface DecoderSession { writer: DecoderWriter; chain: Promise<void> }
let decoderSession: DecoderSession | null = null
let unsubscribePacket: (() => void) | null = null
let unsubscribeSize: (() => void) | null = null
let unsubscribeStopped: (() => void) | null = null
let pointerDown = false
let pendingMove: PointerEvent | null = null
let moveFrame = 0
let statsTimer = 0
let lastFrameCount = 0
let isComposing = false

function setupDecoder(): void {
  if (!screenCanvas.value || !WebCodecsVideoDecoder.isSupported) {
    throw new Error('当前 Chromium 环境不支持 WebCodecs 硬件解码。')
  }
  disposeDecoder()
  lastFrameCount = 0
  const renderer = new WebGLVideoFrameRenderer(screenCanvas.value)
  decoder = new WebCodecsVideoDecoder({ codec: ScrcpyVideoCodecId.H264, renderer })
  decoderSession = { writer: decoder.writable.getWriter(), chain: Promise.resolve() }
  decoder.sizeChanged(size => { videoSize.value = size })
}

function receivePacket(packet: ScrcpyVideoPacket): void {
  const session = decoderSession
  if (!session) return
  const parsed = packet.type === 'configuration'
    ? { type: 'configuration' as const, data: new Uint8Array(packet.data) }
    : {
        type: 'data' as const, data: new Uint8Array(packet.data),
        keyframe: packet.keyframe, pts: packet.pts === undefined ? undefined : BigInt(packet.pts)
      }
  session.chain = session.chain.then(async () => {
    if (decoderSession !== session) return
    await session.writer.write(parsed)
  }).catch(error => {
    if (decoderSession === session) {
      errorMessage.value = `视频解码失败：${error instanceof Error ? error.message : String(error)}`
    }
  })
}

async function startStreaming(): Promise<void> {
  const serial = deviceStore.selectedSerial
  if (!serial || !window.electronAPI || isStarting.value) return
  isStarting.value = true
  streamSerial.value = serial
  errorMessage.value = ''
  try {
    await nextTick()
    setupDecoder()
    const result = await window.electronAPI.startScrcpy(serial, {
      maxSize: maxSize.value, bitRate: bitRateMbps.value * 1_000_000,
      maxFps: maxFps.value, stayAwake: true, turnScreenOff: false
    })
    if (!result.success) throw new Error(result.message)
    if (deviceStore.selectedSerial !== serial) {
      await window.electronAPI.stopScrcpy()
      throw new Error('设备已切换，投屏启动已取消。')
    }
    isStreaming.value = true
    await nextTick()
    inputSink.value?.focus()
  } catch (error) {
    streamSerial.value = null
    disposeDecoder()
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    isStarting.value = false
  }
}

async function stopStreaming(): Promise<void> {
  isStreaming.value = false
  streamSerial.value = null
  disposeDecoder()
  await window.electronAPI?.stopScrcpy()
}

function disposeDecoder(): void {
  const session = decoderSession
  decoderSession = null
  try { session?.writer.releaseLock() } catch { /* pending writes are abandoned with this session */ }
  decoder?.dispose()
  decoder = null
  videoSize.value = { width: 0, height: 0 }
  renderedFps.value = 0
  lastFrameCount = 0
}

function pointFromEvent(event: PointerEvent | WheelEvent, clampOutside = false) {
  const canvas = screenCanvas.value
  if (!canvas || !videoSize.value.width || !videoSize.value.height) return null
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  if (!clampOutside && (event.clientX < rect.left || event.clientX >= rect.right
    || event.clientY < rect.top || event.clientY >= rect.bottom)) return null
  return {
    x: Math.max(0, Math.min(videoSize.value.width - 1, (event.clientX - rect.left) / rect.width * videoSize.value.width)),
    y: Math.max(0, Math.min(videoSize.value.height - 1, (event.clientY - rect.top) / rect.height * videoSize.value.height)),
    width: videoSize.value.width, height: videoSize.value.height
  }
}

function send(event: ScrcpyControlEvent): void { void window.electronAPI?.sendScrcpyControl(event) }
function onPointerDown(event: PointerEvent): void {
  const point = pointFromEvent(event)
  if (!point) return
  pointerDown = true
  screenHost.value?.setPointerCapture(event.pointerId)
  inputSink.value?.focus()
  send({ type: 'touch', action: 'down', ...point })
}
function onPointerMove(event: PointerEvent): void {
  if (!pointerDown) return
  pendingMove = event
  if (!moveFrame) moveFrame = requestAnimationFrame(() => {
    moveFrame = 0
    if (pendingMove) {
      const point = pointFromEvent(pendingMove, true)
      if (point) send({ type: 'touch', action: 'move', ...point })
    }
    pendingMove = null
  })
}
function onPointerUp(event: PointerEvent): void {
  if (!pointerDown) return
  pointerDown = false
  if (moveFrame) cancelAnimationFrame(moveFrame)
  moveFrame = 0
  pendingMove = null
  const point = pointFromEvent(event, true)
  if (point) send({ type: 'touch', action: 'up', ...point })
}
function onWheel(event: WheelEvent): void {
  const point = pointFromEvent(event)
  if (!point) return
  send({ type: 'scroll', ...point, deltaX: -Math.sign(event.deltaX), deltaY: -Math.sign(event.deltaY) })
}

const specialKeys: Record<string, string> = {
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  Enter: 'Enter', Backspace: 'Backspace', Delete: 'Delete', Escape: 'Escape',
  Tab: 'Tab', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown'
}
function onKeyDown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.altKey || event.metaKey) return
  if (event.key.length === 1 || event.key === 'Process') return
  if (!specialKeys[event.key]) return
  send({ type: 'key', action: 'down', key: specialKeys[event.key] })
  event.preventDefault()
}
function onKeyUp(event: KeyboardEvent): void {
  if (!specialKeys[event.key]) return
  send({ type: 'key', action: 'up', key: specialKeys[event.key] })
  event.preventDefault()
}
function onTextInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement
  if (isComposing) return
  if (target.value) send({ type: 'text', text: target.value })
  target.value = ''
}
function onCompositionEnd(): void {
  isComposing = false
}
function command(value: 'home' | 'back' | 'app-switch' | 'power' | 'rotate'): void {
  send({ type: 'command', command: value })
}

async function captureScreenshot(): Promise<void> {
  const blob = await decoder?.snapshot()
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `screenshot_${Date.now()}.png`
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  unsubscribePacket = window.electronAPI?.onScrcpyPacket(receivePacket) || null
  unsubscribeSize = window.electronAPI?.onScrcpySize(size => { videoSize.value = size }) || null
  unsubscribeStopped = window.electronAPI?.onScrcpyStopped(message => {
    isStreaming.value = false
    disposeDecoder()
    if (message) errorMessage.value = message
  }) || null
  statsTimer = window.setInterval(() => {
    const count = decoder?.framesRendered || 0
    renderedFps.value = count - lastFrameCount
    lastFrameCount = count
  }, 1000)
})
watch(() => deviceStore.selectedSerial, (serial, previousSerial) => {
  if (serial !== previousSerial && (isStreaming.value || isStarting.value || streamSerial.value)) {
    void stopStreaming()
  }
})
onUnmounted(() => {
  unsubscribePacket?.(); unsubscribeSize?.(); unsubscribeStopped?.()
  window.clearInterval(statsTimer)
  if (isStreaming.value) void window.electronAPI?.stopScrcpy()
  disposeDecoder()
})
</script>

<style scoped>
.status-pill { @apply flex items-center gap-1.5 text-[10px] tracking-wide text-brand bg-brand/10 px-2 py-1 rounded border border-brand/30; }
.icon-button { @apply p-2 bg-dark-800 hover:bg-dark-700 border border-dark-700 text-gray-400 hover:text-white rounded-md disabled:opacity-30; }
.icon-button :deep(svg), .primary-button :deep(svg), .stop-button :deep(svg), .nav-button :deep(svg) { @apply w-3.5 h-3.5; }
.primary-button { @apply px-3 py-2 bg-brand hover:bg-brand-hover disabled:opacity-40 text-dark-900 rounded-md text-xs font-semibold flex items-center gap-1.5; }
.stop-button { @apply px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 rounded-md text-xs font-medium flex items-center gap-1.5; }
.empty-state { @apply max-w-md flex flex-col items-center text-center gap-4; }
.empty-state h2 { @apply text-base font-semibold text-gray-100 mt-1; }
.empty-state p { @apply text-xs leading-6 text-gray-500; }
.screen-host { @apply h-full w-full flex items-center justify-center outline-none; }
.screen-host canvas { max-width: 100%; max-height: 100%; width: auto; height: auto; background: #000; box-shadow: 0 18px 55px rgb(0 0 0 / .5); border-radius: 6px; cursor: default; }
.input-sink { position: absolute; width: 1px; height: 1px; left: -10000px; top: 0; opacity: 0; pointer-events: none; }
.error-banner { @apply px-4 py-3 border border-red-500/30 bg-red-500/10 backdrop-blur rounded-md flex items-start gap-2 text-xs text-red-300; }
.panel-title { @apply px-4 py-3 text-[9px] font-semibold tracking-[0.16em] text-gray-600; }
.setting-row { @apply block text-[11px] text-gray-500; }
.setting-row select { @apply mt-1.5 w-full bg-dark-900 border border-dark-700 rounded px-2 py-2 text-xs text-gray-300 disabled:opacity-50; }
.nav-button { @apply h-9 flex items-center justify-center rounded-md border border-dark-700 bg-dark-900 text-gray-400 hover:text-brand hover:border-brand/30 disabled:opacity-30 text-xs; }
.hint-icon { @apply w-3 h-3 text-brand/60; }
</style>
