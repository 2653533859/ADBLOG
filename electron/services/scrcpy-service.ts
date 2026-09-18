import { app, BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { AdbServerClient } from '@yume-chan/adb'
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp'
import { AdbScrcpyClient, AdbScrcpyOptionsLatest } from '@yume-chan/adb-scrcpy'
import {
  AndroidKeyCode, AndroidKeyEventAction, AndroidMotionEventAction,
  AndroidMotionEventButton, ScrcpyPointerId
} from '@yume-chan/scrcpy'
import { PushReadableStream } from '@yume-chan/stream-extra'
import { adbService } from './adb-service'
import { ScrcpyControlEvent, ScrcpyOptions } from '../../src/types'

const SERVER_VERSION = '3.3.3'
const DEVICE_SERVER_PATH = '/data/local/tmp/adblog-scrcpy-server.jar'
type VideoStream = Awaited<AdbScrcpyClient<AdbScrcpyOptionsLatest<true>>['videoStream']>

export class ScrcpyService {
  private client: AdbScrcpyClient<AdbScrcpyOptionsLatest<true>> | null = null
  private generation = 0
  private videoWidth = 0
  private videoHeight = 0

  public async startStream(serial: string, options: ScrcpyOptions, window: BrowserWindow):
    Promise<{ success: boolean; message: string; codec?: number }> {
    await this.stopStream()
    const generation = ++this.generation
    let client: AdbScrcpyClient<AdbScrcpyOptionsLatest<true>> | null = null
    try {
      const serverPath = this.findServerPath()
      if (!serverPath) return { success: false, message: `缺少 scrcpy-server ${SERVER_VERSION}。` }

      const connector = new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 })
      const adb = await new AdbServerClient(connector).createAdb({ serial })
      const serverBytes = new Uint8Array(await readFile(serverPath))
      const serverStream = new PushReadableStream<Uint8Array>(async controller => {
        await controller.enqueue(serverBytes)
      })
      await AdbScrcpyClient.pushServer(adb, serverStream, DEVICE_SERVER_PATH)

      const scrcpyOptions = new AdbScrcpyOptionsLatest({
        video: true, audio: false, control: true, videoCodec: 'h264',
        maxSize: options.maxSize, maxFps: options.maxFps,
        videoBitRate: options.bitRate, stayAwake: options.stayAwake,
        sendDeviceMeta: false, sendFrameMeta: true
      })
      client = await AdbScrcpyClient.start(adb, DEVICE_SERVER_PATH, scrcpyOptions)
      const video = await client.videoStream
      if (!video || generation !== this.generation) {
        await client.close()
        return { success: false, message: '投屏启动已取消。' }
      }

      this.client = client
      this.videoWidth = video.metadata.width || 0
      this.videoHeight = video.metadata.height || 0
      video.sizeChanged(({ width, height }) => {
        this.videoWidth = width
        this.videoHeight = height
        this.send(window, 'scrcpy-size', { width, height })
      })
      if (options.turnScreenOff) await client.controller?.setScreenPowerMode(0)
      void this.forwardVideo(video, client, generation, window)
      void client.exited.then(() => {
        if (generation === this.generation) this.finish(window, '设备投屏连接已结束。')
      })
      return { success: true, message: 'embedded stream started', codec: video.metadata.codec }
    } catch (error) {
      await client?.close().catch(() => undefined)
      if (generation === this.generation) {
        if (this.client === client) this.client = null
        this.videoWidth = 0
        this.videoHeight = 0
      }
      return { success: false, message: this.formatError(error) }
    }
  }

  private async forwardVideo(video: VideoStream,
    client: AdbScrcpyClient<AdbScrcpyOptionsLatest<true>>,
    generation: number, window: BrowserWindow): Promise<void> {
    const reader = video.stream.getReader()
    try {
      while (generation === this.generation) {
        const { done, value: packet } = await reader.read()
        if (done) break
        if (generation !== this.generation) break
        this.send(window, 'scrcpy-packet', {
          type: packet.type,
          keyframe: packet.type === 'data' ? packet.keyframe : undefined,
          pts: packet.type === 'data' && packet.pts !== undefined ? packet.pts.toString() : undefined,
          data: packet.data.slice()
        })
      }
    } catch (error) {
      if (generation === this.generation) this.finish(window, this.formatError(error))
    } finally {
      reader.releaseLock()
      if (this.client === client && generation === this.generation) await client.close().catch(() => undefined)
    }
  }

  public async sendControl(event: ScrcpyControlEvent): Promise<void> {
    const controller = this.client?.controller
    if (!controller) return
    if (event.type === 'touch') {
      const width = event.width || this.videoWidth
      const height = event.height || this.videoHeight
      const action = event.action === 'down' ? AndroidMotionEventAction.Down
        : event.action === 'move' ? AndroidMotionEventAction.Move : AndroidMotionEventAction.Up
      await controller.injectTouch({
        action, pointerId: ScrcpyPointerId.Finger,
        pointerX: Math.round(event.x), pointerY: Math.round(event.y),
        videoWidth: width, videoHeight: height,
        pressure: action === AndroidMotionEventAction.Up ? 0 : 1,
        actionButton: AndroidMotionEventButton.Primary,
        buttons: action === AndroidMotionEventAction.Up ? AndroidMotionEventButton.None : AndroidMotionEventButton.Primary
      })
      return
    }
    if (event.type === 'scroll') {
      const width = event.width || this.videoWidth
      const height = event.height || this.videoHeight
      await controller.injectScroll({
        pointerX: Math.round(event.x), pointerY: Math.round(event.y),
        videoWidth: width, videoHeight: height,
        scrollX: event.deltaX, scrollY: event.deltaY, buttons: AndroidMotionEventButton.None
      })
      return
    }
    if (event.type === 'text') {
      await controller.injectText(event.text)
      return
    }
    if (event.type === 'key') {
      const keyCode = AndroidKeyCode[event.key as keyof typeof AndroidKeyCode]
      if (keyCode !== undefined) {
        const action = event.action === 'down' ? AndroidKeyEventAction.Down : AndroidKeyEventAction.Up
        await controller.injectKeyCode({ action, keyCode, repeat: 0, metaState: 0 })
      }
      return
    }
    if (event.command === 'rotate') await controller.rotateDevice()
    else {
      const keyCode = event.command === 'home' ? AndroidKeyCode.AndroidHome
        : event.command === 'back' ? AndroidKeyCode.AndroidBack
          : event.command === 'app-switch' ? AndroidKeyCode.AndroidAppSwitch : AndroidKeyCode.Power
      await controller.injectKeyCode({ action: AndroidKeyEventAction.Down, keyCode, repeat: 0, metaState: 0 })
      await controller.injectKeyCode({ action: AndroidKeyEventAction.Up, keyCode, repeat: 0, metaState: 0 })
    }
  }

  public async stopStream(): Promise<void> {
    ++this.generation
    const client = this.client
    this.client = null
    this.videoWidth = 0
    this.videoHeight = 0
    await client?.close().catch(() => undefined)
  }

  private finish(window: BrowserWindow, message: string): void {
    this.client = null
    this.videoWidth = 0
    this.videoHeight = 0
    this.send(window, 'scrcpy-stopped', message)
  }

  private send(window: BrowserWindow, channel: string, value: unknown): void {
    if (!window.isDestroyed()) window.webContents.send(channel, value)
  }

  private findServerPath(): string | null {
    const roots = [app.getAppPath(), process.resourcesPath, path.dirname(process.execPath)]
      .filter((root): root is string => Boolean(root))
    const candidates = roots.map(root => path.join(root, 'tools', 'scrcpy', `scrcpy-server-v${SERVER_VERSION}`))
    return candidates.find(candidate => fs.existsSync(candidate)) || null
  }

  private formatError(error: unknown): string {
    const detail = error instanceof Error ? error.message : String(error)
    return `内嵌投屏启动失败：${detail}`
  }

  public async captureSingleScreenshot(serial: string): Promise<string | null> {
    const { promise, resolve } = Promise.withResolvers<string | null>()
    try {
      const proc = adbService.spawn(['-s', serial, 'exec-out', 'screencap', '-p'])
      const chunks: Buffer[] = []
      proc.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk))
      proc.on('close', code => resolve(code === 0 && chunks.length > 0
        ? `data:image/png;base64,${Buffer.concat(chunks).toString('base64')}` : null))
      proc.on('error', () => resolve(null))
    } catch { resolve(null) }
    return promise
  }
}

export const scrcpyService = new ScrcpyService()
