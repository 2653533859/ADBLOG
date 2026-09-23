import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { writeFile } from 'fs/promises'
import { existsSync } from 'fs'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.commandLine.appendSwitch('disable-gpu-cache')
app.setAppUserModelId('com.adblog.studio')
import { adbService } from './services/adb-service'
import { discoveryService } from './services/discovery-service'
import { deviceInfoService } from './services/device-info-service'
import { appService } from './services/app-service'
import { logcatService } from './services/logcat-service'
import { fileService } from './services/file-service'
import { terminalService } from './services/terminal-service'
import { perfService } from './services/perf-service'
import { scrcpyService } from './services/scrcpy-service'
import { LogcatFilterOptions, ScrcpyControlEvent, ScrcpyOptions } from '../src/types'

let mainWindow: BrowserWindow | null = null

function findAppIcon(): string | undefined {
  const candidates = [
    path.join(app.getAppPath(), 'public', 'app-icon.ico'),
    path.join(__dirname, '../dist/app-icon.ico'),
    path.join(process.resourcesPath, 'app-icon.ico')
  ]
  return candidates.find(candidate => existsSync(candidate))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#0b0f12',
    icon: findAppIcon(),
    title: 'ADBlog Studio',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0b0f12',
      symbolColor: '#c8d0cc',
      height: 32
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.setMenuBarVisibility(false)

  mainWindow.webContents.on('console-message', (_e, _level, message, line, sourceId) => {
    console.log(`[Renderer Console] (${sourceId}:${line}) ${message}`)
  })

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    console.warn(`[Load Failed] ${errorCode}: ${errorDescription} (${validatedURL})`)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    // vite-plugin-electron normalizes loopback hosts to localhost. Keep Electron
    // on the same IPv4 interface as Vite instead of relying on DNS ordering.
    const url = new URL(process.env.VITE_DEV_SERVER_URL)
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1'
    const devUrl = url.href
    console.log(`[Main] Loading dev server: ${devUrl}`)
    const loadWithRetry = (attempts = 0) => {
      mainWindow?.loadURL(devUrl).catch(() => {
        console.log(`[DevServer] Waiting for Vite server at ${devUrl} (attempt ${attempts + 1})...`)
        if (attempts < 30) {
          setTimeout(() => loadWithRetry(attempts + 1), 500)
        } else {
          console.error('[DevServer] Max retries reached. Check that Vite is still running.')
        }
      })
    }
    loadWithRetry()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  mainWindow.on('closed', () => {
    mainWindow = null
    logcatService.stop()
    perfService.stop()
    scrcpyService.stopStream()
    terminalService.closeAll()
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// === IPC Handlers ===

// ADB & Device
ipcMain.handle('adb:getDevices', () => adbService.getDevices())
ipcMain.handle('adb:connect', (_e, ip: string, port?: number) => adbService.connect(ip, port))
ipcMain.handle('adb:disconnect', (_e, serial: string) => adbService.disconnect(serial))
ipcMain.handle('adb:scanLan', (_e, port?: number, subnet?: string) => discoveryService.scanLan(port, subnet))
ipcMain.handle('adb:getDeviceInfo', (_e, serial: string) => deviceInfoService.getDeviceInfo(serial))
ipcMain.handle('adb:getInstalledApps', (_e, serial: string) => appService.getInstalledApps(serial))
ipcMain.handle('adb:getAppPid', (_e, serial: string, pkg: string) => appService.getAppPid(serial, pkg))
ipcMain.handle('adb:getAppPids', (_e, serial: string, pkg: string) => appService.getAppPids(serial, pkg))
ipcMain.handle('adb:installApk', (_e, serial: string, localPath: string) => appService.installApk(serial, localPath))

// Logcat
ipcMain.handle('logcat:start', (_e, serial: string) => {
  if (mainWindow) logcatService.start(serial, mainWindow)
})
ipcMain.handle('logcat:stop', () => logcatService.stop())
ipcMain.handle('logcat:clear', (_e, serial?: string) => logcatService.clear(serial))
ipcMain.handle('logcat:startRecording', (_e, filePath: string) => logcatService.startRecording(filePath))
ipcMain.handle('logcat:stopRecording', () => logcatService.stopRecording())
ipcMain.handle('logcat:getBufferedLogs', (_e, filter?: LogcatFilterOptions) => logcatService.getBufferedLogs(filter))

// File Manager
ipcMain.handle('files:list', (_e, serial: string, dirPath?: string) => fileService.listDirectory(serial, dirPath))
ipcMain.handle('files:push', (_e, serial: string, localPath: string, remotePath: string) =>
  fileService.pushFile(serial, localPath, remotePath)
)
ipcMain.handle('files:pull', (_e, serial: string, remotePath: string, localPath: string) =>
  fileService.pullFile(serial, remotePath, localPath)
)
ipcMain.handle('files:mkdir', (_e, serial: string, remotePath: string) => fileService.createDirectory(serial, remotePath))
ipcMain.handle('files:rm', (_e, serial: string, remotePath: string) => fileService.deleteFile(serial, remotePath))
ipcMain.handle('files:rename', (_e, serial: string, oldPath: string, newPath: string) =>
  fileService.renameFile(serial, oldPath, newPath)
)

// Terminal
ipcMain.handle('terminal:create', (_e, sessionId: string, serial: string) => {
  if (mainWindow) return terminalService.createSession(sessionId, serial, mainWindow)
  return false
})
ipcMain.handle('terminal:write', (_e, sessionId: string, data: string) => terminalService.write(sessionId, data))
ipcMain.handle('terminal:resize', (_e, sessionId: string, cols: number, rows: number) =>
  terminalService.resize(sessionId, cols, rows)
)
ipcMain.handle('terminal:close', (_e, sessionId: string) => terminalService.closeSession(sessionId))

// Performance
ipcMain.handle('perf:start', (_e, serial: string, pkg: string | null) => {
  if (mainWindow) perfService.start(serial, pkg, mainWindow)
})
ipcMain.handle('perf:stop', () => perfService.stop())

// Scrcpy & Screen
ipcMain.handle('scrcpy:start', (_e, serial: string, options: ScrcpyOptions) => {
  if (mainWindow) return scrcpyService.startStream(serial, options, mainWindow)
  return { success: false, message: 'No window' }
})
ipcMain.handle('scrcpy:stop', () => scrcpyService.stopStream())
ipcMain.handle('scrcpy:control', (_e, event: ScrcpyControlEvent) => scrcpyService.sendControl(event))
ipcMain.handle('scrcpy:screenshot', (_e, serial: string) => scrcpyService.captureSingleScreenshot(serial))

ipcMain.handle('file:writeText', (_e, filePath: string, content: string) => writeFile(filePath, content, 'utf8'))

// Native Dialogs
ipcMain.handle('dialog:saveFile', async (_e, defaultName: string) => {
  if (!mainWindow) return null
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [
      { name: 'Supported files', extensions: [path.extname(defaultName).slice(1) || 'txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  return res.canceled ? null : res.filePath
})

ipcMain.handle('dialog:openDirectory', async () => {
  if (!mainWindow) return null
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
})

ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return null
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile']
  })
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
})

ipcMain.handle('dialog:openApk', async () => {
  if (!mainWindow) return null
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Android 安装包', extensions: ['apk'] }
    ]
  })
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
})
