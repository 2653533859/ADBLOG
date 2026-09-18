import { execFile, spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { DeviceItem } from '../../src/types'

export function quoteRemoteArgument(value: string): string {
  if (value.includes('\0')) throw new Error('NUL is not allowed in shell arguments')
  return "'" + value.replace(/'/g, "'\"'\"'") + "'"
}

export class AdbService {
  public adbPath: string = 'adb'

  constructor() {
    this.detectAdbPath()
  }

  private detectAdbPath(): void {
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
    const candidates = [
      resourcesPath ? path.join(resourcesPath, 'tools', 'scrcpy', 'adb.exe') : '',
      'E:\\csh\\adb\\platform-tools\\adb.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
      path.join(process.env.ANDROID_HOME || '', 'platform-tools', 'adb.exe'),
      path.join(process.env.ANDROID_SDK_ROOT || '', 'platform-tools', 'adb.exe'),
      'adb'
    ]

    for (const candidate of candidates) {
      if (!candidate) continue
      if (candidate === 'adb') {
        this.adbPath = 'adb'
        break
      }
      if (fs.existsSync(candidate)) {
        this.adbPath = candidate
        console.log(`[AdbService] Detected adb at: ${candidate}`)
        return
      }
    }
  }

  public exec(args: string[], timeout = 10000): Promise<string> {
    const { promise, resolve, reject } = Promise.withResolvers<string>()
    // ADB joins shell arguments again on Android; quote each literal there.
    const shellIndex = args[0] === 'shell' ? 0 : args[0] === '-s' && args[2] === 'shell' ? 2 : -1
    const argv = shellIndex < 0 ? args : [
      ...args.slice(0, shellIndex + 1),
      args.slice(shellIndex + 1).map(quoteRemoteArgument).join(' ')
    ]
    execFile(this.adbPath, argv, { timeout, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
      } else {
        resolve(stdout.trim())
      }
    })
    return promise
  }

  public spawn(args: string[]): ChildProcess {
    return spawn(this.adbPath, args)
  }

  public async getDevices(): Promise<DeviceItem[]> {
    try {
      const output = await this.exec(['devices', '-l'])
      const lines = output.split('\n').map(l => l.trim()).filter(Boolean)
      const devices: DeviceItem[] = []

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        if (line.startsWith('*')) continue

        const parts = line.split(/\s+/)
        if (parts.length < 2) continue

        const serial = parts[0]
        const state = parts[1] as 'device' | 'offline' | 'unauthorized'

        let status: 'online' | 'offline' | 'unauthorized' = 'offline'
        if (state === 'device') status = 'online'
        else if (state === 'unauthorized') status = 'unauthorized'

        const isIp = serial.includes(':')
        const ip = isIp ? serial.split(':')[0] : '127.0.0.1'
        const port = isIp ? parseInt(serial.split(':')[1], 10) || 5555 : 5555

        let model = ''
        let product = ''
        for (const part of parts) {
          if (part.startsWith('model:')) model = part.replace('model:', '')
          if (part.startsWith('product:')) product = part.replace('product:', '')
        }

        devices.push({
          serial,
          ip,
          port,
          status,
          connectionType: isIp ? 'wifi' : 'usb',
          model: model || product || serial
        })
      }

      return devices
    } catch (err: unknown) {
      console.error('[AdbService] Failed to query devices:', err)
      return []
    }
  }

  public async connect(ip: string, port = 5555): Promise<{ success: boolean; message: string }> {
    try {
      const target = `${ip}:${port}`
      const out = await this.exec(['connect', target], 8000)
      const success = out.includes('connected to') || out.includes('already connected')
      return { success, message: out }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      return { success: false, message: msg }
    }
  }

  public async disconnect(serial: string): Promise<{ success: boolean; message: string }> {
    try {
      const out = await this.exec(['disconnect', serial], 5000)
      return { success: true, message: out }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Disconnect failed'
      return { success: false, message: msg }
    }
  }
}

export const adbService = new AdbService()
