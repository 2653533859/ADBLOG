import { randomUUID } from 'crypto'
import { rename, rm, stat } from 'fs/promises'
import { adbService } from './adb-service'

export class TraceService {
  async capture(serial: string, destination: string, durationSeconds: number): Promise<{ path: string; bytes: number }> {
    if (!serial || !destination || !Number.isInteger(durationSeconds) || durationSeconds < 5 || durationSeconds > 60) {
      throw new Error('无效的设备、保存路径或追踪时长。')
    }
    const remote = `/data/misc/perfetto-traces/adblog-${randomUUID()}.perfetto-trace`
    const partial = `${destination}.partial-${randomUUID()}`
    try {
      await adbService.exec(['-s', serial, 'shell', 'perfetto', '-o', remote, '-t', `${durationSeconds}s`,
        'sched', 'freq', 'idle', 'am', 'wm', 'gfx', 'view', 'input'], (durationSeconds + 30) * 1000)
      await adbService.exec(['-s', serial, 'pull', remote, partial], 120000)
      const info = await stat(partial)
      if (info.size === 0) throw new Error('追踪文件为空。')
      await rename(partial, destination)
      return { path: destination, bytes: info.size }
    } finally {
      await rm(partial, { force: true }).catch(() => undefined)
      await adbService.exec(['-s', serial, 'shell', 'rm', '-f', remote], 10000).catch(() => undefined)
    }
  }

  async inspect(filePath: string): Promise<{ path: string; bytes: number }> {
    if (!/\.(?:perfetto-trace|pftrace|trace)$/i.test(filePath)) throw new Error('请选择 Perfetto trace 文件。')
    const info = await stat(filePath)
    if (!info.isFile() || info.size === 0) throw new Error('追踪文件无效或为空。')
    return { path: filePath, bytes: info.size }
  }
}
export const traceService = new TraceService()
