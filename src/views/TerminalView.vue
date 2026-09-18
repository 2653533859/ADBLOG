<template>
  <div class="flex-1 flex flex-col h-full bg-dark-900 overflow-hidden select-none">
    <!-- Top Session Tabs & Quick Commands -->
    <div class="h-11 bg-dark-850 border-b border-dark-700 px-3 flex items-center justify-between gap-3 shrink-0">
      <!-- Tabs -->
      <div class="flex items-center gap-1 overflow-x-auto">
        <div
          v-for="session in sessions"
          :key="session.id"
          @click="activateSession(session.id)"
          class="flex items-center gap-2 px-3 py-1.5 rounded-t text-xs cursor-pointer border-t-2 transition"
          :class="activeSessionId === session.id ? 'bg-dark-900 border-brand text-white font-medium' : 'border-transparent text-gray-400 hover:text-white hover:bg-dark-750'"
        >
          <TerminalIcon class="w-3.5 h-3.5" />
          <span>{{ session.title }}</span>
          <button
            v-if="sessions.length > 1"
            @click.stop="closeSession(session.id)"
            class="hover:text-red-400 text-gray-500 rounded p-0.5"
          >
            <X class="w-3 h-3" />
          </button>
        </div>

        <button
          @click="addNewSession"
          title="新建终端会话"
          class="p-1 hover:bg-dark-750 text-gray-400 hover:text-white rounded transition ml-1"
        >
          <Plus class="w-4 h-4" />
        </button>
      </div>

      <!-- Quick Commands -->
      <div class="flex items-center gap-1.5">
        <button
          v-if="endedSessionIds.has(activeSessionId)"
          @click="reconnectSession(activeSessionId)"
          class="px-2 py-1 bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand rounded text-[11px] transition"
        >
          重新连接
        </button>
        <span class="text-[11px] text-gray-500">常用:</span>
        <button
          v-for="cmd in quickCommands"
          :key="cmd.label"
          @click="sendQuickCommand(cmd.code)"
          class="px-2 py-1 bg-dark-800 hover:bg-dark-750 border border-dark-700 text-gray-300 hover:text-white rounded text-[11px] font-mono transition"
        >
          {{ cmd.label }}
        </button>
      </div>
    </div>

    <!-- Terminal Container -->
    <div class="flex-1 p-2 bg-[#121316] relative overflow-hidden">
      <div ref="terminalContainer" class="w-full h-full"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Terminal as TerminalIcon, Plus, X } from 'lucide-vue-next'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useDeviceStore } from '../stores/device'

interface SessionItem {
  id: string
  title: string
}

interface TerminalItem {
  term: Terminal
  fit: FitAddon
  host: HTMLDivElement
  unsubs: (() => void)[]
  serial: string
  ended: boolean
}

const deviceStore = useDeviceStore()
const terminalContainer = ref<HTMLDivElement | null>(null)

const sessions = ref<SessionItem[]>([
  { id: 'term-1', title: 'Shell 1' }
])
const activeSessionId = ref('term-1')
const endedSessionIds = ref(new Set<string>())

const terminals = new Map<string, TerminalItem>()

const quickCommands = [
  { label: 'top', code: 'top\n' },
  { label: 'df -h', code: 'df -h\n' },
  { label: 'ps -ef', code: 'ps -ef\n' },
  { label: '清屏', code: 'clear\n' }
]

async function connectSession(sessionId: string): Promise<void> {
  if (!terminalContainer.value || !window.electronAPI) return
  for (const [id, item] of terminals) item.host.style.display = id === sessionId ? 'block' : 'none'
  let item = terminals.get(sessionId)
  const serial = deviceStore.selectedSerial
  if (!serial) return
  if (item && (item.serial !== serial || item.ended)) {
    disposeLocalSession(sessionId)
    item = undefined
  }
  if (!item) {
    const host = document.createElement('div')
    host.style.height = '100%'
    terminalContainer.value.appendChild(host)
    const term = new Terminal({ theme: { background: '#121316', foreground: '#e5e7eb' },
      fontSize: 13, fontFamily: 'JetBrainsMono NFM, JetBrains Mono, Cascadia Mono, Consolas, monospace',
      fontWeight: '400', fontWeightBold: '600', lineHeight: 1.16, cursorBlink: true, scrollback: 10000 })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    const writeOutput = (data: string) => {
      term.write(data, () => term.refresh(0, term.rows - 1))
    }
    writeOutput(`\x1b[90mConnecting to ${serial}…\x1b[0m\r\n`)
    let terminalItem: TerminalItem
    const unsubs = [
      window.electronAPI.onTerminalData(sessionId, writeOutput),
      window.electronAPI.onTerminalExit(sessionId, () => {
        terminalItem.ended = true
        endedSessionIds.value = new Set(endedSessionIds.value).add(sessionId)
        writeOutput('\r\n[Session ended]\r\n')
      })
    ]
    const input = term.onData(data => { void window.electronAPI.writeTerminal(sessionId, data) })
    unsubs.push(() => input.dispose())
    terminalItem = { term, fit, host, unsubs, serial, ended: false }
    item = terminalItem
    terminals.set(sessionId, item)
    const ok = await window.electronAPI.createTerminal(sessionId, serial)
    if (!ok) {
      terminalItem.ended = true
      endedSessionIds.value = new Set(endedSessionIds.value).add(sessionId)
      writeOutput('\r\n[Unable to create session]\r\n')
    } else {
      const ended = new Set(endedSessionIds.value)
      ended.delete(sessionId)
      endedSessionIds.value = ended
    }
  }
  await nextTick()
  handleResize()
  item.term.focus()
}

function handleResize(): void {
  const item = terminals.get(activeSessionId.value)
  if (!item || !terminalContainer.value?.clientWidth) return
  item.fit.fit()
  item.term.refresh(0, item.term.rows - 1)
  void window.electronAPI?.resizeTerminal(activeSessionId.value, item.term.cols, item.term.rows)
}

function addNewSession(): void {
  const id = `term-${crypto.randomUUID()}`
  sessions.value.push({ id, title: `Shell ${sessions.value.length + 1}` })
  activeSessionId.value = id
}

function closeSession(sessionId: string): void {
  void window.electronAPI?.closeTerminal(sessionId)
  disposeLocalSession(sessionId)
  sessions.value = sessions.value.filter(s => s.id !== sessionId)
  if (activeSessionId.value === sessionId && sessions.value.length) activeSessionId.value = sessions.value[0].id
}

function activateSession(sessionId: string): void {
  if (activeSessionId.value === sessionId) {
    if (terminals.get(sessionId)?.ended) void connectSession(sessionId)
    return
  }
  activeSessionId.value = sessionId
}

function reconnectSession(sessionId: string): void {
  void connectSession(sessionId)
}

function disposeLocalSession(sessionId: string): void {
  const item = terminals.get(sessionId)
  item?.unsubs.forEach(u => u())
  item?.term.dispose()
  item?.host.remove()
  terminals.delete(sessionId)
  const ended = new Set(endedSessionIds.value)
  ended.delete(sessionId)
  endedSessionIds.value = ended
}

function sendQuickCommand(cmd: string): void {
  void window.electronAPI?.writeTerminal(activeSessionId.value, cmd)
}

watch(activeSessionId, id => { void connectSession(id) })
watch(() => deviceStore.selectedSerial, async (serial, previousSerial) => {
  if (serial === previousSerial) return
  for (const id of [...terminals.keys()]) {
    await window.electronAPI?.closeTerminal(id)
    disposeLocalSession(id)
  }
  if (serial) void connectSession(activeSessionId.value)
})
onMounted(() => {
  window.addEventListener('resize', handleResize)
  void connectSession(activeSessionId.value)
})
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  for (const id of [...terminals.keys()]) closeSession(id)
})
</script>
