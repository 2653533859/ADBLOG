import type { BrowserWindow } from 'electron'
import type { ScrcpyControlEvent, ScrcpyOptions } from '../../src/types'
import { LogcatService } from './logcat-service'
import { ScrcpyService } from './scrcpy-service'

const MAX_ACTIVE_DEVICES = 4

export class MultiDeviceService {
  private mirrors = new Map<string, ScrcpyService>()
  private logs = new Map<string, LogcatService>()

  async startMirror(serial: string, options: ScrcpyOptions, window: BrowserWindow): Promise<{ success: boolean; message: string; codec?: number }> {
    if (!serial) return { success: false, message: '请选择设备。' }
    let service = this.mirrors.get(serial)
    if (!service) {
      if (this.mirrors.size >= MAX_ACTIVE_DEVICES) return { success: false, message: '最多同时投屏 4 台设备。' }
      service = new ScrcpyService(serial, () => {
        if (this.mirrors.get(serial) === service) this.mirrors.delete(serial)
      })
      this.mirrors.set(serial, service)
    }
    const result = await service.startStream(serial, options, window)
    if (!result.success && this.mirrors.get(serial) === service) {
      this.mirrors.delete(serial)
      await service.stopStream()
    }
    return result
  }

  async stopMirror(serial: string): Promise<void> {
    const service = this.mirrors.get(serial)
    this.mirrors.delete(serial)
    await service?.stopStream()
  }

  async sendControl(serial: string, event: ScrcpyControlEvent): Promise<void> {
    await this.mirrors.get(serial)?.sendControl(event)
  }

  startLogs(serial: string, window: BrowserWindow): void {
    if (!serial) throw new Error('请选择设备。')
    let service = this.logs.get(serial)
    if (!service) {
      if (this.logs.size >= MAX_ACTIVE_DEVICES) throw new Error('最多同时查看 4 台设备的日志。')
      service = new LogcatService(serial, 5000)
      this.logs.set(serial, service)
    }
    service.start(serial, window)
  }

  stopLogs(serial: string): void {
    this.logs.get(serial)?.stop()
    this.logs.delete(serial)
  }

  async startLogRecording(serial: string, filePath: string): Promise<boolean> {
    const service = this.logs.get(serial)
    return service ? service.startRecording(filePath, false) : false
  }

  stopLogRecording(serial: string): void {
    this.logs.get(serial)?.stopRecording()
  }

  stopAll(): void {
    for (const serial of [...this.logs.keys()]) this.stopLogs(serial)
    for (const serial of [...this.mirrors.keys()]) void this.stopMirror(serial)
  }
}

export const multiDeviceService = new MultiDeviceService()
