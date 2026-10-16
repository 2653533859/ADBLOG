import { randomUUID } from 'node:crypto'
import { FileHandle, mkdtemp, open, rename, rm } from 'node:fs/promises'
import * as path from 'node:path'

interface RecordingSession {
  destination: string
  temporaryDirectory: string
  temporaryFile: string
  handle: FileHandle
  pending: Promise<void>
  bytesWritten: number
}

export class VideoRecordingService {
  private sessions = new Map<string, RecordingSession>()
  private pendingOperations = new Set<Promise<unknown>>()

  private track<T>(operation: Promise<T>): Promise<T> {
    this.pendingOperations.add(operation)
    void operation.finally(() => this.pendingOperations.delete(operation)).catch(() => undefined)
    return operation
  }

  private async removeTemporaryDirectory(temporaryDirectory: string, destination: string): Promise<void> {
    const target = path.resolve(temporaryDirectory)
    const parent = path.resolve(path.dirname(destination))
    if (path.dirname(target).toLowerCase() !== parent.toLowerCase() ||
      !path.basename(target).startsWith('.adblog-recording-')) {
      throw new Error('录制临时目录超出目标目录。')
    }
    await rm(target, { recursive: true, force: true })
  }

  public hasActiveSessions(): boolean {
    return this.sessions.size > 0 || this.pendingOperations.size > 0
  }

  public async abortAll(): Promise<void> {
    const pending = [...this.pendingOperations]
    const aborts = [...this.sessions.keys()].map(id => this.abort(id))
    const results = await Promise.allSettled([...pending, ...aborts])
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failure) throw failure.reason
  }

  public async start(destination: string): Promise<string> {
    if (!destination || path.extname(destination).toLowerCase() !== '.webm') {
      throw new Error('录制文件必须保存为 .webm。')
    }
    const temporaryDirectory = await mkdtemp(path.join(path.dirname(destination), '.adblog-recording-'))
    try {
      const temporaryFile = path.join(temporaryDirectory, 'recording.webm')
      const handle = await open(temporaryFile, 'wx')
      const id = randomUUID()
      this.sessions.set(id, { destination, temporaryDirectory, temporaryFile, handle,
        pending: Promise.resolve(), bytesWritten: 0 })
      return id
    } catch (error) {
      await this.removeTemporaryDirectory(temporaryDirectory, destination)
      throw error
    }
  }

  public append(id: string, bytes: Uint8Array): Promise<void> {
    const session = this.sessions.get(id)
    if (!session) throw new Error('录制会话已结束。')
    if (!ArrayBuffer.isView(bytes) || bytes.byteLength === 0 || bytes.byteLength > 4 * 1024 * 1024) {
      throw new Error('无效的录制片段。')
    }
    session.pending = session.pending.then(async () => {
      await session.handle.writeFile(bytes)
      session.bytesWritten += bytes.byteLength
    })
    return session.pending
  }

  public finish(id: string): Promise<string> {
    const session = this.sessions.get(id)
    if (!session) throw new Error('录制会话已结束。')
    this.sessions.delete(id)
    return this.track((async () => {
      try {
        await session.pending
        if (session.bytesWritten === 0) throw new Error('录制内容为空。')
        await session.handle.close()
        await rename(session.temporaryFile, session.destination)
        await this.removeTemporaryDirectory(session.temporaryDirectory, session.destination)
        return session.destination
      } catch (error) {
        await session.handle.close().catch(() => undefined)
        throw new Error(`录制未能完成保存，临时文件位于 ${session.temporaryFile}：${error instanceof Error ? error.message : String(error)}`)
      }
    })())
  }

  public abort(id: string): Promise<void> {
    const session = this.sessions.get(id)
    if (!session) return Promise.resolve()
    this.sessions.delete(id)
    return this.track((async () => {
      await session.pending.catch(() => undefined)
      await session.handle.close().catch(() => undefined)
      await this.removeTemporaryDirectory(session.temporaryDirectory, session.destination)
    })())
  }
}

export const videoRecordingService = new VideoRecordingService()
