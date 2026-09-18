import { adbService } from './adb-service'
import { RemoteFileItem } from '../../src/types'

export class FileService {
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
      const out = await adbService.exec(['-s', serial, 'push', localPath, remotePath], 60000)
      return { success: true, message: out }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Push failed'
      return { success: false, message: msg }
    }
  }

  public async pullFile(serial: string, remotePath: string, localPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const out = await adbService.exec(['-s', serial, 'pull', remotePath, localPath], 60000)
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
