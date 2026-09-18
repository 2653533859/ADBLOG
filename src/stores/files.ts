import { defineStore } from 'pinia'
import { RemoteFileItem } from '../types'

export const useFileStore = defineStore('files', {
  state: () => ({
    currentPath: '/sdcard',
    files: [] as RemoteFileItem[],
    isLoading: false,
    selectedFile: null as RemoteFileItem | null,
    history: ['/sdcard'] as string[],
    historyIndex: 0,
    transferMessage: null as string | null
  }),

  actions: {
    async loadPath(serial: string, targetPath: string): Promise<void> {
      if (!window.electronAPI) return
      this.isLoading = true
      this.selectedFile = null
      try {
        const list = await window.electronAPI.listFiles(serial, targetPath)
        this.files = list
        this.currentPath = targetPath

        if (this.history[this.historyIndex] !== targetPath) {
          this.history = this.history.slice(0, this.historyIndex + 1)
          this.history.push(targetPath)
          this.historyIndex = this.history.length - 1
        }
      } finally {
        this.isLoading = false
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

      this.transferMessage = '正在上传...'
      try {
        const res = await window.electronAPI.pushFile(serial, localFile, this.currentPath)
        this.transferMessage = res.success ? '上传成功' : `上传失败: ${res.message}`
        await this.loadPath(serial, this.currentPath)
        setTimeout(() => {
          this.transferMessage = null
        }, 3000)
        return res.success
      } catch {
        this.transferMessage = '上传异常'
        return false
      }
    },

    async downloadFile(serial: string, item: RemoteFileItem): Promise<boolean> {
      if (!window.electronAPI) return false
      const localTarget = await window.electronAPI.showSaveDialog(item.name)
      if (!localTarget) return false

      this.transferMessage = '正在下载...'
      try {
        const res = await window.electronAPI.pullFile(serial, item.path, localTarget)
        this.transferMessage = res.success ? '下载成功' : `下载失败: ${res.message}`
        setTimeout(() => {
          this.transferMessage = null
        }, 3000)
        return res.success
      } catch {
        this.transferMessage = '下载异常'
        return false
      }
    }
  }
})
