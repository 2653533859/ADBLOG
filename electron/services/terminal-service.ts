import { ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import { adbService } from './adb-service'

interface TerminalSessionState {
  id: string
  serial: string
  child: ChildProcess
  tty?: string
  cols?: number
  rows?: number
  buffer: string
}

export class TerminalService {
  private sessions = new Map<string, TerminalSessionState>()

  public createSession(sessionId: string, serial: string, window: BrowserWindow): boolean {
    const existing = this.sessions.get(sessionId)
    if (existing?.serial === serial) {
      if (existing.buffer && !window.isDestroyed()) {
        window.webContents.send(`terminal-data-${sessionId}`, existing.buffer)
      }
      return true
    }
    if (existing) this.closeSession(sessionId)

    try {
      const child = adbService.spawn(['-s', serial, 'shell', '-tt', "printf '__ADBLOG_TTY__'; tty; exec env TERM=xterm-256color sh -i"])
      const session: TerminalSessionState = { id: sessionId, serial, child, buffer: '' }
      this.sessions.set(sessionId, session)

      const sendOutput = (output: string) => {
        if (!output) return
        session.buffer = (session.buffer + output).slice(-128 * 1024)
        if (!window.isDestroyed()) window.webContents.send(`terminal-data-${sessionId}`, output)
      }

      let pending = ''
      let initialized = false
      child.stdout?.on('data', (chunk: Buffer) => {
        let output = chunk.toString('utf8')
        if (!initialized) {
          pending += output
          // adb shell -tt can translate a device CRLF into CRCRLF on Windows.
          const match = pending.match(/__ADBLOG_TTY__(\/dev\/pts\/\d+)\r*\n/)
          if (!match && pending.length < 4096) return
          if (match) {
            session.tty = match[1]
            this.resize(sessionId, session.cols || 80, session.rows || 24)
            output = pending.replace(match[0], '')
          } else output = pending
          initialized = true
        }
        sendOutput(output)
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        sendOutput(chunk.toString('utf8'))
      })

      child.on('error', error => {
        sendOutput(`\r\n[Unable to start shell: ${error.message}]\r\n`)
        if (!window.isDestroyed()) window.webContents.send(`terminal-exit-${sessionId}`)
        if (this.sessions.get(sessionId)?.child === child) this.sessions.delete(sessionId)
      })
      child.on('exit', () => {
        if (!window.isDestroyed()) {
          window.webContents.send(`terminal-exit-${sessionId}`)
        }
        if (this.sessions.get(sessionId)?.child === child) this.sessions.delete(sessionId)
      })

      return true
    } catch (err: unknown) {
      console.error('[TerminalService] Failed to create shell session:', err)
      return false
    }
  }

  public write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (session?.child.stdin?.writable) {
      session.child.stdin.write(data)
    }
  }

  public resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (session) { session.cols = cols; session.rows = rows }
    if (session?.tty && Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0) {
      void adbService.exec(['-s', session.serial, 'shell', 'stty', '-F', session.tty,
        'cols', String(cols), 'rows', String(rows)]).catch(console.error)
    }
  }

  public closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.child.kill('SIGTERM')
      this.sessions.delete(sessionId)
    }
  }

  public closeAll(): void {
    for (const session of this.sessions.values()) {
      session.child.kill('SIGTERM')
    }
    this.sessions.clear()
  }
}

export const terminalService = new TerminalService()
