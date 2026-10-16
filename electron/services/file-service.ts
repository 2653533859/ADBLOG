import { adbService } from './adb-service'
import { BrowserWindow } from 'electron'
import { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rename, rm } from 'node:fs/promises'
import * as path from 'node:path'
import { FileTransferTask, RemoteFileItem } from '../../src/types'

export class FileService {
  private activeTransfers = new Map<string, ChildProcess>()

  public transfer(task: FileTransferTask, window: BrowserWindow): Promise<{ success: boolean; message: string; canceled?: boolean }> {
    if (this.activeTransfers.has(task.taskId)) return Promise.resolve({ success: false, message: '任务已经在传输中' })
    return new Promise(resolve => {
      const temporaryPath = task.direction === 'pull'
        ? path.join(path.dirname(task.localPath), `.${path.basename(task.localPath)}.${randomUUID()}.adblog-part`)
        : null
      const args = task.direction === 'push'
        ? ['-s', task.serial, 'push', '-p', task.localPath, task.remotePath]
        : ['-s', task.serial, 'pull', '-p', task.remotePath, temporaryPath!]
      let proc: ChildProcess
      try { proc = adbService.spawn(args) }
      catch (error) { resolve({ success: false, message: error instanceof Error ? error.message : String(error) }); return }
      this.activeTransfers.set(task.taskId, proc)
      let output = ''
      let canceled = false
      let timedOut = false
      let processError = ''
      let settled = false
      let lastPercent = -1
      const timeout = setTimeout(() => { timedOut = true; proc.kill() }, 30 * 60_000)
      const finish = async (successful: boolean, outputMessage: string) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.canceledTransfers.delete(task.taskId)
        let success = successful
        let message = outputMessage
        if (temporaryPath) {
          if (success) {
            try {
              await rename(temporaryPath, task.localPath)
            } catch (error) {
              success = false
              message = `保存下载文件失败：${error instanceof Error ? error.message : String(error)}`
            }
          }
          if (!success) {
            try {
              await rm(temporaryPath, { force: true })
            } catch (error) {
              message += `；清理临时文件失败：${temporaryPath}（${error instanceof Error ? error.message : String(error)}）`
            }
          }
        }
        this.activeTransfers.delete(task.taskId)
        resolve({ success, message, canceled })
      }
      const receive = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-6000)
        const matches = [...chunk.toString().matchAll(/\b(\d{1,3})%/g)]
        const percent = matches.length ? Number(matches[matches.length - 1][1]) : -1
        if (percent >= 0 && percent <= 100 && percent !== lastPercent && !window.isDestroyed()) {
          lastPercent = percent
          window.webContents.send('file-transfer-progress', { taskId: task.taskId, percent })
        }
      }
      proc.stdout?.on('data', receive)
      proc.stderr?.on('data', receive)
      proc.once('error', error => { processError = error.message })
      proc.once('close', code => { void finish(code === 0 && !canceled && !timedOut && !processError,
        timedOut ? '传输超时' : canceled ? '已取消' : processError || output.trim() || `adb 退出码 ${code}`) })
      this.canceledTransfers.set(task.taskId, () => { canceled = true; proc.kill() })
    })
  }

  private canceledTransfers = new Map<string, () => void>()

  public cancelTransfer(taskId: string): boolean {
    const cancel = this.canceledTransfers.get(taskId)
    if (!cancel) return false
    this.canceledTransfers.delete(taskId)
    cancel()
    return true
  }
  public async listDirectory(serial: string, remotePath = '/sdcard'): Promise<RemoteFileItem[]> {
    try {
      const normalizedPath = remotePath.endsWith('/') ? remotePath : `${remotePath}/`
      const out = await adbService.exec(['-s', serial, 'shell', 'ls', '-la', '--', normalizedPath], 8000)
      const lines = out.split('\n').map(l => l.trim()).filter(Boolean)
      const items: RemoteFileItem[] = []

      for (const line of lines) {
        if (line.startsWith('total')) continue

        const parts = line.split(/\s+/)
        if (parts.length < 8) continue

        const permissions = parts[0]
        const isDirectory = permissions.startsWith('d')
        const isSymlink = permissions.startsWith('l')

        let size = 0
        let datePart = ''
        let name = ''

        let sizeIndex = -1
        for (let i = 3; i < parts.length; i++) {
          if (/^\d+$/.test(parts[i])) {
            sizeIndex = i
            break
          }
        }

        if (sizeIndex !== -1) {
          size = parseInt(parts[sizeIndex], 10) || 0
          datePart = parts.slice(sizeIndex + 1, sizeIndex + 3).join(' ')
          name = parts.slice(sizeIndex + 3).join(' ')
        } else {
          name = parts[parts.length - 1]
        }

        if (!name || name === '.' || name === '..') {
          continue
        }

        if (name.includes(' -> ')) {
          name = name.split(' -> ')[0]
        }

        const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined

        items.push({
          name,
          path: `${normalizedPath}${name}`,
          isDirectory,
          isSymlink,
          size,
          permissions,
          modifyTime: Date.parse(datePart) || Date.now(),
          ext
        })
      }

      return items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
    } catch (err: unknown) {
      console.error('[FileService] Failed to list directory:', err)
      return []
    }
  }

  public async pushFile(serial: string, localPath: string, remotePath: string): Promise<{ success: boolean; message: string }> {
    try {
      const out = await adbService.exec(['-s', serial, 'push', localPath, remotePath], 30 * 60_000)
      return { success: true, message: out }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Push failed'
      return { success: false, message: msg }
    }
  }

  public async pullFile(serial: string, remotePath: string, localPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const out = await adbService.exec(['-s', serial, 'pull', remotePath, localPath], 30 * 60_000)
      return { success: true, message: out }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Pull failed'
      return { success: false, message: msg }
    }
  }

  public async createDirectory(serial: string, remotePath: string): Promise<{ success: boolean; message: string }> {
    try {
      const out = await adbService.exec(['-s', serial, 'shell', 'mkdir', '-p', '--', remotePath])
      return { success: true, message: out }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Mkdir failed'
      return { success: false, message: msg }
    }
  }

  public async deleteFile(serial: string, remotePath: string): Promise<{ success: boolean; message: string }> {
    try {
      const out = await adbService.exec(['-s', serial, 'shell', 'rm', '-rf', '--', remotePath])
      return { success: true, message: out }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      return { success: false, message: msg }
    }
  }

  public async renameFile(serial: string, oldPath: string, newPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const out = await adbService.exec(['-s', serial, 'shell', 'mv', '--', oldPath, newPath])
      return { success: true, message: out }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rename failed'
      return { success: false, message: msg }
    }
  }
}

export const fileService = new FileService()
