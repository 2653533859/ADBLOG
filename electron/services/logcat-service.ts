import { ChildProcess } from 'child_process'
import * as fs from 'fs'
import { BrowserWindow } from 'electron'
import { adbService } from './adb-service'
import { LogcatEntry, LogLevel, LogcatFilterOptions } from '../../src/types'
import { filterLogcatEntries } from '../../src/utils/logcat-filter'

export class LogcatService {
  private child: ChildProcess | null = null
  private currentSerial: string | null = null
  private ringBuffer: LogcatEntry[] = []
  private maxBufferSize = 50000
  private idCounter = 1

  private batchQueue: LogcatEntry[] = []
  private batchTimer: NodeJS.Timeout | null = null
  // Updating the renderer at ~30 fps makes a busy logcat stream compete with
  // clicks and painting. Five updates per second still feels live while keeping
  // enough main-thread time available for interaction.
  private batchIntervalMs = 200
  private restartTimer: NodeJS.Timeout | null = null

  private recordStream: fs.WriteStream | null = null
  private isRecording = false
  private window: BrowserWindow | null = null

  private lineRemainder = ''
  private lastEntryRaw: string | null = null
  private logRegex = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEAF])\s+([^:]+):\s+(.*)$/

  public start(serial: string, window: BrowserWindow): void {
    this.stop()
    this.window = window
    this.currentSerial = serial
    this.ringBuffer = []
    this.batchQueue = []
    this.idCounter = 1
    this.lineRemainder = ''
    this.lastEntryRaw = null

    this.launchCollector(serial, window)

    this.batchTimer = setInterval(() => {
      if (this.batchQueue.length > 0 && !window.isDestroyed()) {
        const toSend = this.batchQueue
        this.batchQueue = []
        window.webContents.send('logcat-batch', toSend)
      }
    }, this.batchIntervalMs)
  }

  private launchCollector(serial: string, window: BrowserWindow): void {
    if (this.currentSerial !== serial || window.isDestroyed()) return
    // Each launch begins with -T 1, which can replay the final line already
    // collected by the previous process. Only that first parsed line may be a replay.
    let replayCandidate = this.lastEntryRaw
    this.lineRemainder = ''
    this.child = adbService.spawn(['-s', serial, 'logcat', '-v', 'threadtime', '-T', '1'])

    const child = this.child
    this.child.on('error', (error) => {
      console.error('[LogcatService]', error)
      this.handleCollectorExit(child, serial, window)
    })
    this.child.stderr?.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8').trim()
      if (message) console.error('[LogcatService]', message)
    })
    this.child.stdout?.on('data', (chunk: Buffer) => {
      if (this.child !== child) return
      const text = this.lineRemainder + chunk.toString('utf8')
      const lines = text.split('\n')
      this.lineRemainder = lines.pop() || ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue

        const entry = this.parseLine(line)
        if (entry) {
          if (replayCandidate !== null) {
            const isReplay = entry.raw === replayCandidate
            replayCandidate = null
            if (isReplay) continue
          }
          this.pushEntry(entry)
          if (this.isRecording && this.recordStream) {
            this.recordStream.write(`${entry.raw}\n`)
          }
        }
      }
    })

    this.child.on('exit', () => {
      console.log('[LogcatService] Logcat process exited')
      this.handleCollectorExit(child, serial, window)
    })
  }

  private handleCollectorExit(child: ChildProcess, serial: string, window: BrowserWindow): void {
    if (this.child !== child) return
    this.child = null
    if (this.currentSerial !== serial || window.isDestroyed() || this.restartTimer) return
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      this.launchCollector(serial, window)
    }, 1000)
  }

  public stop(): void {
    this.currentSerial = null
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    if (this.batchTimer) {
      clearInterval(this.batchTimer)
      this.batchTimer = null
    }

    if (this.child) {
      this.child.kill('SIGTERM')
      this.child = null
    }

    this.stopRecording()
  }

  public clear(serial?: string): Promise<string> {
    this.ringBuffer = []
    this.batchQueue = []
    this.lineRemainder = ''
    this.lastEntryRaw = null
    if (serial) {
      return adbService.exec(['-s', serial, 'logcat', '-c']).catch(() => '')
    }
    return Promise.resolve('')
  }

  public async startRecording(filePath: string): Promise<boolean> {
    this.stopRecording()
    if (!this.child) return false
    return new Promise(resolve => {
      const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' })
      this.recordStream = stream
      stream.on('error', (error) => {
        if (this.recordStream === stream) {
          this.recordStream = null
          this.isRecording = false
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('logcat-recording-error', error.message)
          }
        }
        resolve(false)
      })
      stream.once('close', () => resolve(false))
      stream.once('open', () => {
        if (this.recordStream !== stream) { stream.end(); resolve(false); return }
        this.isRecording = true
        resolve(true)
      })
    })
  }

  public stopRecording(): void {
    this.isRecording = false
    if (this.recordStream) {
      this.recordStream.end()
      this.recordStream = null
    }
  }

  private pushEntry(entry: LogcatEntry): void {
    this.lastEntryRaw = entry.raw
    this.ringBuffer.push(entry)
    if (this.ringBuffer.length > this.maxBufferSize) {
      this.ringBuffer.shift()
    }
    this.batchQueue.push(entry)
    if (this.batchQueue.length > 2000) {
      this.batchQueue.splice(0, this.batchQueue.length - 2000)
    }
  }

  private parseLine(line: string): LogcatEntry | null {
    const match = this.logRegex.exec(line)
    if (!match) {
      return null
    }

    let rawLevel = match[4]
    if (rawLevel === 'F') rawLevel = 'A'
    const level = (rawLevel as LogLevel) || 'V'

    return {
      id: this.idCounter++,
      timestamp: match[1],
      pid: parseInt(match[2], 10),
      tid: parseInt(match[3], 10),
      level,
      tag: match[5].trim(),
      message: match[6],
      raw: line
    }
  }

  public getBufferedLogs(filter?: LogcatFilterOptions): LogcatEntry[] {
    return filter ? filterLogcatEntries(this.ringBuffer, filter).entries : this.ringBuffer
  }
}

export const logcatService = new LogcatService()
