<template>
  <footer class="h-8 bg-dark-900 border-t border-dark-700 px-5 flex items-center justify-between text-[10px] tracking-wide text-gray-500 select-none shrink-0 font-mono">
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full" :class="deviceStore.isOnline ? 'bg-emerald-500' : 'bg-red-500'"></span>
        <span class="text-gray-400">{{ deviceStore.selectedDevice?.model || '未选择设备' }}</span>
        <span v-if="deviceStore.selectedDevice" class="text-gray-500">{{ deviceStore.selectedDevice.connectionType === 'usb' ? 'USB' : 'Wi-Fi' }}</span>
        <span v-if="deviceStore.selectedSerial" class="text-gray-500">({{ deviceStore.selectedSerial }})</span>
      </div>

      <div v-if="deviceStore.selectedPackage" class="flex items-center gap-1 text-gray-300">
        <span class="text-gray-500">Target:</span>
        <span class="text-brand">{{ deviceStore.selectedPackage }}</span>
        <span v-if="deviceStore.selectedPid" class="text-gray-500">[{{ deviceStore.selectedPid }}]</span>
      </div>
    </div>

    <div class="flex items-center gap-4">
      <div v-if="logcatStore.isRecording" class="flex items-center gap-1 text-red-400 font-semibold animate-pulse">
        <span class="w-2 h-2 rounded-full bg-red-500"></span>
        <span>REC: {{ logcatStore.recordingPath }}</span>
      </div>

      <div v-if="fileStore.transferMessage" class="text-amber-400">
        {{ fileStore.transferMessage }}
      </div>

      <div class="flex items-center gap-3">
        <span>RATE <strong class="text-brand font-semibold">{{ logcatStore.logRate }}</strong>/s</span>
        <span>BUFFER <strong class="text-gray-300 font-semibold">{{ logcatStore.entries.length }}</strong></span>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { useDeviceStore } from '../../stores/device'
import { useLogcatStore } from '../../stores/logcat'
import { useFileStore } from '../../stores/files'

const deviceStore = useDeviceStore()
const logcatStore = useLogcatStore()
const fileStore = useFileStore()
</script>
