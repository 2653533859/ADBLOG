<template>
  <div class="flex flex-col h-screen w-screen overflow-hidden bg-dark-900 text-gray-200">
    <!-- Native window controls remain available in the title bar overlay. -->
    <div class="app-titlebar shrink-0" role="banner">
      <img class="app-titlebar-icon" :src="appIconUrl" alt="" aria-hidden="true" />
      <span>ADBlog Studio</span>
    </div>

    <!-- Top Bar -->
    <TopBar />

    <!-- Center Workspace -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left Activity Bar -->
      <SideNav :activeTab="activeTab" @update:activeTab="activeTab = $event" />

      <!-- Main Viewport -->
      <main class="flex-1 flex flex-col overflow-hidden relative">
        <KeepAlive>
          <component :is="currentViewComponent" />
        </KeepAlive>
      </main>
    </div>

    <!-- Status Bar -->
    <StatusBar />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import TopBar from './components/layout/TopBar.vue'
import SideNav from './components/layout/SideNav.vue'
import StatusBar from './components/layout/StatusBar.vue'

import LogcatView from './views/LogcatView.vue'
import ScrcpyView from './views/ScrcpyView.vue'
import FileView from './views/FileView.vue'
import TerminalView from './views/TerminalView.vue'
import PerfView from './views/PerfView.vue'
import AppsView from './views/AppsView.vue'
import DeviceInfoView from './views/DeviceInfoView.vue'

import { useDeviceStore } from './stores/device'
import { useLogcatStore } from './stores/logcat'

const activeTab = ref('logcat')
const appIconUrl = './app-icon.png'
const deviceStore = useDeviceStore()
const logcatStore = useLogcatStore()
let pidRefreshTimer: ReturnType<typeof setInterval> | null = null
let pidRefreshInFlight = false

const currentViewComponent = computed(() => {
  switch (activeTab.value) {
    case 'logcat': return LogcatView
    case 'scrcpy': return ScrcpyView
    case 'files': return FileView
    case 'terminal': return TerminalView
    case 'perf': return PerfView
    case 'apps': return AppsView
    case 'info': return DeviceInfoView
    default: return LogcatView
  }
})

watch(() => deviceStore.selectedSerial, (serial) => {
  logcatStore.setTargetPids(null)
  void (serial ? logcatStore.startStream(serial) : logcatStore.stopStream())
}, { flush: 'sync' })

watch(() => deviceStore.selectedPackage, (pkg) => {
  if (pidRefreshTimer) {
    clearInterval(pidRefreshTimer)
    pidRefreshTimer = null
  }
  // A new app selection starts a new PID history. Do not carry the previous
  // app's PIDs across the short gap before the new lookup completes.
  logcatStore.setTargetPids(pkg ? [] : null)
  if (!pkg) return

  pidRefreshTimer = setInterval(async () => {
    if (pidRefreshInFlight) return
    pidRefreshInFlight = true
    try {
      await deviceStore.refreshSelectedAppPids()
    } finally {
      pidRefreshInFlight = false
    }
  }, 1500)
}, { flush: 'sync' })

watch(() => deviceStore.selectedPids, (pids) => {
  if (deviceStore.selectedPackage) logcatStore.retainTargetPids(pids)
})

onMounted(async () => {
  await deviceStore.fetchDevices()

})

onBeforeUnmount(() => {
  if (pidRefreshTimer) clearInterval(pidRefreshTimer)
})
</script>
