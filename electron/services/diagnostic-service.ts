import { createWriteStream } from 'node:fs'
import { mkdtemp, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { ZipArchive } from 'archiver'
import { adbService } from './adb-service'
import { deviceInfoService } from './device-info-service'
import { logcatService } from './logcat-service'
import { scrcpyService } from './scrcpy-service'
import type { PerfMetricsSample } from '../../src/types'

export interface DiagnosticBundleOptions {
  serial: string
  destination: string
  lastMinutes: number
  includeBugreport: boolean
  perfSamples: PerfMetricsSample[]
}

export class DiagnosticService {
  public async createBundle(options: DiagnosticBundleOptions): Promise<{ path: string; warnings: string[] }> {
    const device = (await adbService.getDevices()).find(item => item.serial === options.serial && item.status === 'online')
    if (!device) throw new Error('设备已离线，请重新检测设备后再采集。')
    if (!Number.isInteger(options.lastMinutes) || options.lastMinutes < 1 || options.lastMinutes > 60) {
      throw new Error('日志时间范围必须为 1 到 60 分钟。')
    }

    const warnings: string[] = []
    const capturedAt = new Date()
    const tempDir = await mkdtemp(path.join(tmpdir(), 'adblog-diagnostics-'))
    let tempOutputDir: string
    try {
      tempOutputDir = await mkdtemp(path.join(path.dirname(options.destination), '.adblog-export-'))
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true })
      throw error
    }
    const tempOutputPath = path.join(tempOutputDir, 'diagnostics.zip')
    const output = createWriteStream(tempOutputPath)
    const archive = new ZipArchive({ zlib: { level: 6 } })
    const completed = new Promise<void>((resolve, reject) => {
      output.once('close', resolve)
      output.once('error', reject)
      archive.once('error', reject)
    })
    archive.pipe(output)

    try {
      const details = await deviceInfoService.getDeviceInfo(options.serial)
      archive.append(JSON.stringify({ device, details, capturedAt: capturedAt.toISOString() }, null, 2), {
        name: 'device.json'
      })

      const screenshot = await scrcpyService.captureSingleScreenshot(options.serial)
      if (screenshot) archive.append(Buffer.from(screenshot.split(',')[1], 'base64'), { name: 'screenshot.png' })
      else warnings.push('截图采集失败')

      const cutoff = capturedAt.getTime() - options.lastMinutes * 60_000
      const logs = logcatService.getBufferedLogsForSerial(options.serial)
        .filter(entry => this.parseLogTime(entry.timestamp, capturedAt) >= cutoff)
        .map(entry => entry.raw)
      if (logs.length === 0) warnings.push('所选时间范围内没有应用缓存的日志')
      archive.append(logs.join('\n') + (logs.length ? '\n' : ''), { name: 'logcat.txt' })

      const samples = options.perfSamples.filter(sample => sample.timestamp >= cutoff && sample.timestamp <= capturedAt.getTime())
      archive.append(JSON.stringify(samples, null, 2), { name: 'performance.json' })
      if (samples.length === 0) warnings.push('所选时间范围内没有性能监控数据')

      if (options.includeBugreport) {
        const bugreportPath = path.join(tempDir, 'bugreport.zip')
        try {
          await adbService.exec(['-s', options.serial, 'bugreport', bugreportPath], 180_000)
          if ((await stat(bugreportPath)).size === 0) throw new Error('bugreport 文件为空')
          archive.file(bugreportPath, { name: 'bugreport.zip' })
        } catch (error) {
          warnings.push(`bugreport 采集失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }

      archive.append(JSON.stringify({
        capturedAt: capturedAt.toISOString(), serial: options.serial,
        lastMinutes: options.lastMinutes, warnings
      }, null, 2), { name: 'manifest.json' })
      await archive.finalize()
      await completed
      await rename(tempOutputPath, options.destination)
      return { path: options.destination, warnings }
    } catch (error) {
      archive.abort()
      output.destroy()
      throw error
    } finally {
      await rm(tempDir, { recursive: true, force: true })
      await rm(tempOutputDir, { recursive: true, force: true })
    }
  }

  private parseLogTime(timestamp: string, capturedAt: Date): number {
    const match = /^(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(timestamp)
    if (!match) return 0
    const [, month, day, hour, minute, second, millisecond] = match
    let time = new Date(capturedAt.getFullYear(), Number(month) - 1, Number(day),
      Number(hour), Number(minute), Number(second), Number(millisecond)).getTime()
    if (time > capturedAt.getTime() + 24 * 60 * 60_000) {
      time = new Date(capturedAt.getFullYear() - 1, Number(month) - 1, Number(day),
        Number(hour), Number(minute), Number(second), Number(millisecond)).getTime()
    }
    return time
  }
}

export const diagnosticService = new DiagnosticService()
