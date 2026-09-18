import { defineStore } from 'pinia'
import { DeviceItem, DeviceDetailInfo, AppItem, ScanResult } from '../types'

export const useDeviceStore = defineStore('device', {
  state: () => ({
    devices: [] as DeviceItem[],
    selectedSerial: null as string | null,
    deviceInfo: null as DeviceDetailInfo | null,
    apps: [] as AppItem[],
    selectedPackage: null as string | null,
    selectedPid: null as number | null,
    isScanning: false,
    scanResults: [] as ScanResult[],
    isLoadingApps: false,
    isLoadingInfo: false
  }),

  getters: {
    selectedDevice: (state): DeviceItem | undefined => {
      return state.devices.find(d => d.serial === state.selectedSerial)
    },
    isOnline: (state): boolean => {
      const dev = state.devices.find(d => d.serial === state.selectedSerial)
      return dev?.status === 'online'
    }
  },

  actions: {
    async fetchDevices(): Promise<void> {
      if (!window.electronAPI) return
      this.devices = await window.electronAPI.getDevices()
      if (this.devices.length > 0 && !this.devices.some(d => d.serial === this.selectedSerial)) {
        await this.selectDevice(this.devices[0].serial)
      } else if (this.devices.length === 0) {
        this.selectedPackage = null
        this.selectedPid = null
        this.selectedSerial = null
        this.deviceInfo = null
        this.apps = []
      }
    },

    async selectDevice(serial: string): Promise<void> {
      if (this.selectedSerial === serial) return
      this.selectedPackage = null
      this.selectedPid = null
      this.selectedSerial = serial
      await Promise.all([this.fetchDeviceInfo(serial), this.fetchApps(serial)])
    },

    async fetchDeviceInfo(serial: string): Promise<void> {
      if (!window.electronAPI) return
      this.isLoadingInfo = true
      try {
        const info = await window.electronAPI.getDeviceInfo(serial)
        if (this.selectedSerial === serial) this.deviceInfo = info
      } finally {
        this.isLoadingInfo = false
      }
    },

    async fetchApps(serial: string): Promise<void> {
      if (!window.electronAPI) return
      this.isLoadingApps = true
      try {
        const apps = await window.electronAPI.getInstalledApps(serial)
        if (this.selectedSerial === serial) this.apps = apps
      } finally {
        this.isLoadingApps = false
      }
    },

    async selectApp(pkg: string | null): Promise<void> {
      this.selectedPackage = pkg
      if (!pkg || !this.selectedSerial || !window.electronAPI) {
        this.selectedPid = null
        return
      }
      const serial = this.selectedSerial
      const pid = await window.electronAPI.getAppPid(serial, pkg)
      if (this.selectedSerial === serial && this.selectedPackage === pkg) this.selectedPid = pid
    },

    async connect(ip: string, port = 5555): Promise<{ success: boolean; message: string }> {
      if (!window.electronAPI) return { success: false, message: 'Electron API unavailable' }
      const res = await window.electronAPI.connectDevice(ip, port)
      await this.fetchDevices()
      if (res.success) {
        const targetSerial = `${ip}:${port}`
        await this.selectDevice(targetSerial)
      }
      return res
    },

    async disconnect(serial: string): Promise<{ success: boolean; message: string }> {
      if (!window.electronAPI) return { success: false, message: 'Electron API unavailable' }
      const res = await window.electronAPI.disconnectDevice(serial)
      await this.fetchDevices()
      return res
    },

    async scanLan(subnet?: string): Promise<ScanResult[]> {
      if (!window.electronAPI) return []
      this.isScanning = true
      try {
        this.scanResults = await window.electronAPI.scanLan(5555, subnet)
        return this.scanResults
      } finally {
        this.isScanning = false
      }
    }
  }
})
