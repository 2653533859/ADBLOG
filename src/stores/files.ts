import { defineStore } from 'pinia'
import { FileTransferTask, RemoteFileItem } from '../types'
import { useDeviceStore } from './device'

export const useFileStore = defineStore('files', {
  state: () => ({
    currentPath: '/sdcard',
    files: [] as RemoteFileItem[],
    isLoading: false,
    selectedFile: null as RemoteFileItem | null,
    history: ['/sdcard'] as string[],
    historyIndex: 0,
    transferMessage: null as string | null,
    transfers: [] as FileTransferTask[],
    transferRunning: false,
    progressSubscribed: false,
    latestLoadId: 0
  }),

  actions: {
    async loadPath(serial: string, targetPath: string): Promise<void> {
      if (!window.electronAPI || useDeviceStore().selectedSerial !== serial) return
      const loadId = ++this.latestLoadId
      this.isLoading = true
      this.selectedFile = null
      try {
        const list = await window.electronAPI.listFiles(serial, targetPath)
        if (loadId !== this.latestLoadId || useDeviceStore().selectedSerial !== serial) return
        this.files = list
        this.currentPath = targetPath

        if (this.history[this.historyIndex] !== targetPath) {
          this.history = this.history.slice(0, this.historyIndex + 1)
          this.history.push(targetPath)
          this.historyIndex = this.history.length - 1
        }
      } finally {
        if (loadId === this.latestLoadId) this.isLoading = false
      }
    },

    async openItem(serial: string, item: RemoteFileItem): Promise<void> {
      if (item.isDirectory) {
        await this.loadPath(serial, item.path)
      } else {
        this.selectedFile = item
      }
    },

    async goUp(serial: string): Promise<void> {
      if (this.currentPath === '/' || this.currentPath === '') return
      const parts = this.currentPath.split('/').filter(Boolean)
      parts.pop()
      const parent = parts.length === 0 ? '/' : `/${parts.join('/')}`
      await this.loadPath(serial, parent)
    },

    async goBack(serial: string): Promise<void> {
      if (this.historyIndex > 0) {
        this.historyIndex--
        const target = this.history[this.historyIndex]
        await this.loadPath(serial, target)
      }
    },

    async goForward(serial: string): Promise<void> {
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++
        const target = this.history[this.historyIndex]
        await this.loadPath(serial, target)
      }
    },

    async deleteItem(serial: string, item: RemoteFileItem): Promise<boolean> {
      if (!window.electronAPI) return false
      const res = await window.electronAPI.deleteFile(serial, item.path)
      if (res.success) {
        await this.loadPath(serial, this.currentPath)
        return true
      }
      return false
    },

    async createFolder(serial: string, folderName: string): Promise<boolean> {
      if (!window.electronAPI || !folderName.trim()) return false
      const cleanPath = this.currentPath.endsWith('/') ? this.currentPath : `${this.currentPath}/`
      const newPath = `${cleanPath}${folderName.trim()}`
      const res = await window.electronAPI.createDirectory(serial, newPath)
      if (res.success) {
        await this.loadPath(serial, this.currentPath)
        return true
      }
      return false
    },

    async uploadFile(serial: string): Promise<boolean> {
      if (!window.electronAPI) return false
      const localFile = await window.electronAPI.showOpenDialogFile()
      if (!localFile) return false
      let size = 0
      try { size = await window.electronAPI.getLocalFileSize(localFile) }
      catch { return false }

      this.enqueueTransfer({ taskId: crypto.randomUUID(), serial, direction: 'push', localPath: localFile,
        remotePath: this.currentPath, totalBytes: size, transferredBytes: 0, speedBps: 0, status: 'pending' })
      return true
    },

    async downloadFile(serial: string, item: RemoteFileItem): Promise<boolean> {
      if (!window.electronAPI) return false
      const localTarget = await window.electronAPI.showSaveDialog(item.name)
      if (!localTarget) return false

      this.enqueueTransfer({ taskId: crypto.randomUUID(), serial, direction: 'pull', localPath: localTarget,
        remotePath: item.path, totalBytes: item.size, transferredBytes: 0, speedBps: 0, status: 'pending' })
      return true
    },

    enqueueTransfer(task: FileTransferTask): void {
      if (!this.progressSubscribed) {
        window.electronAPI.onFileTransferProgress(({ taskId, percent }) => {
          const current = this.transfers.find(item => item.taskId === taskId)
          if (current && current.status === 'transferring') {
            current.transferredBytes = Math.round(current.totalBytes * percent / 100)
          }
        })
        this.progressSubscribed = true
      }
      this.transfers.unshift(task)
      void this.runTransferQueue()
    },

    async cancelTransfer(taskId: string): Promise<void> {
      const task = this.transfers.find(item => item.taskId === taskId)
      if (task?.status === 'pending') task.status = 'canceled'
      else if (task?.status === 'transferring') await window.electronAPI.cancelFileTransfer(taskId)
    },

    retryTransfer(taskId: string): void {
      const task = this.transfers.find(item => item.taskId === taskId)
      if (!task || (task.status !== 'failed' && task.status !== 'canceled')) return
      task.error = undefined
      task.status = 'pending'
      void this.runTransferQueue()
    },

    clearFinishedTransfers(): void {
      this.transfers = this.transfers.filter(item => item.status === 'pending' || item.status === 'transferring')
    },

    async runTransferQueue(): Promise<void> {
      if (this.transferRunning || !window.electronAPI) return
      this.transferRunning = true
      try {
        while (true) {
          const task = [...this.transfers].reverse().find(item => item.status === 'pending')
          if (!task) break
          task.status = 'transferring'
          const started = performance.now()
          try {
            const result = await window.electronAPI.transferFile({ ...task })
            task.status = result.canceled ? 'canceled' : result.success ? 'completed' : 'failed'
            if (!result.success) task.error = result.message
            else {
              task.transferredBytes = task.totalBytes
              task.speedBps = task.totalBytes / Math.max(0.001, (performance.now() - started) / 1000)
              if (task.direction === 'push' && task.remotePath === this.currentPath &&
                useDeviceStore().selectedSerial === task.serial) await this.loadPath(task.serial, this.currentPath)
            }
          } catch (error) {
            task.status = 'failed'
            task.error = error instanceof Error ? error.message : String(error)
          }
        }
      } finally { this.transferRunning = false }
    }
  }
})
