import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'
import {
  DeviceItem,
  DeviceDetailInfo,
  ApkInstallResult,
  AppItem,
  LogcatEntry,
  LogcatFilterOptions,
  RemoteFileItem,
  FileTransferTask,
  PerfMetricsSample,
  ScrcpyOptions,
  ScrcpyControlEvent,
  ScrcpyVideoPacket,
  ScanResult
} from '../src/types'
import type { DiagnosticBundleOptions } from './services/diagnostic-service'

export interface IElectronAPI {
  // ADB & Device
  getDevices: () => Promise<DeviceItem[]>
  connectDevice: (ip: string, port?: number) => Promise<{ success: boolean; message: string }>
  pairDevice: (ip: string, port: number, code: string) => Promise<{ success: boolean; message: string }>
  disconnectDevice: (serial: string) => Promise<{ success: boolean; message: string }>
  scanLan: (port?: number, subnet?: string) => Promise<ScanResult[]>
  getDeviceInfo: (serial: string) => Promise<DeviceDetailInfo>
  getInstalledApps: (serial: string) => Promise<AppItem[]>
  getAppPid: (serial: string, pkg: string) => Promise<number | null>
  getAppPids: (serial: string, pkg: string) => Promise<number[]>
  installApk: (serial: string, localPath: string) => Promise<ApkInstallResult>

  // Logcat
  startLogcat: (serial: string) => Promise<void>
  stopLogcat: () => Promise<void>
  clearLogcat: (serial?: string) => Promise<string>
  startRecordingLogcat: (filePath: string) => Promise<boolean>
  stopRecordingLogcat: () => Promise<void>
  getBufferedLogs: (filter?: LogcatFilterOptions) => Promise<LogcatEntry[]>
  onLogcatBatch: (callback: (entries: LogcatEntry[]) => void) => () => void

  onRecordingError: (callback: (message: string) => void) => () => void

  // File Manager
  listFiles: (serial: string, dirPath?: string) => Promise<RemoteFileItem[]>
  pushFile: (serial: string, localPath: string, remotePath: string) => Promise<{ success: boolean; message: string }>
  pullFile: (serial: string, remotePath: string, localPath: string) => Promise<{ success: boolean; message: string }>
  transferFile: (task: FileTransferTask) => Promise<{ success: boolean; message: string; canceled?: boolean }>
  cancelFileTransfer: (taskId: string) => Promise<boolean>
  getLocalFileSize: (filePath: string) => Promise<number>
  onFileTransferProgress: (callback: (progress: { taskId: string; percent: number }) => void) => () => void
  createDirectory: (serial: string, remotePath: string) => Promise<{ success: boolean; message: string }>
  deleteFile: (serial: string, remotePath: string) => Promise<{ success: boolean; message: string }>
  renameFile: (
    serial: string,
    oldPath: string,
    newPath: string
  ) => Promise<{ success: boolean; message: string }>

  // Terminal
  createTerminal: (sessionId: string, serial: string) => Promise<boolean>
  writeTerminal: (sessionId: string, data: string) => Promise<void>
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>
  closeTerminal: (sessionId: string) => Promise<void>
  onTerminalData: (sessionId: string, callback: (data: string) => void) => () => void
  onTerminalExit: (sessionId: string, callback: () => void) => () => void

  // Performance
  startPerf: (serial: string, pkg: string | null) => Promise<void>
  stopPerf: () => Promise<void>
  onPerfSample: (callback: (sample: PerfMetricsSample) => void) => () => void

  // Scrcpy & Screen
  startScrcpy: (
    serial: string,
    options: ScrcpyOptions
  ) => Promise<{ success: boolean; message: string; codec?: number }>
  stopScrcpy: () => Promise<void>
  sendScrcpyControl: (event: ScrcpyControlEvent) => Promise<void>
  takeScreenshot: (serial: string) => Promise<string | null>
  clipboardToDevice: () => Promise<void>
  clipboardToHost: () => Promise<number>
  createDiagnosticBundle: (options: DiagnosticBundleOptions) => Promise<{ path: string; warnings: string[] }>
  captureTrace: (serial: string, destination: string, durationSeconds: number) => Promise<{ path: string; bytes: number }>
  inspectTrace: (filePath: string) => Promise<{ path: string; bytes: number }>
  openTraceViewer: () => Promise<void>
  onScrcpyPacket: (callback: (packet: ScrcpyVideoPacket) => void) => () => void
  onScrcpySize: (callback: (size: { width: number; height: number }) => void) => () => void
  onScrcpyStopped: (callback: (message: string) => void) => () => void
  startMultiScrcpy: (serial: string, options: ScrcpyOptions) => Promise<{ success: boolean; message: string; codec?: number }>
  stopMultiScrcpy: (serial: string) => Promise<void>
  sendMultiScrcpyControl: (serial: string, event: ScrcpyControlEvent) => Promise<void>
  onMultiScrcpyPacket: (callback: (serial: string, packet: ScrcpyVideoPacket) => void) => () => void
  onMultiScrcpySize: (callback: (serial: string, size: { width: number; height: number }) => void) => () => void
  onMultiScrcpyStopped: (callback: (serial: string, message: string) => void) => () => void
  startMultiLogcat: (serial: string) => Promise<void>
  stopMultiLogcat: (serial: string) => Promise<void>
  onMultiLogcatBatch: (callback: (serial: string, entries: LogcatEntry[]) => void) => () => void
  startMultiLogcatRecording: (serial: string, filePath: string) => Promise<boolean>
  stopMultiLogcatRecording: (serial: string) => Promise<void>
  onMultiLogcatRecordingError: (callback: (serial: string, message: string) => void) => () => void

  writeTextFile: (filePath: string, content: string) => Promise<void>
  readTextFile: (filePath: string) => Promise<string>
  startVideoRecording: (destination: string) => Promise<string>
  appendVideoRecording: (id: string, bytes: Uint8Array) => Promise<void>
  finishVideoRecording: (id: string) => Promise<string>
  abortVideoRecording: (id: string) => Promise<void>

  // Native Dialogs
  showSaveDialog: (defaultName: string) => Promise<string | null>
  showOpenDialogDirectory: () => Promise<string | null>
  showOpenDialogFile: () => Promise<string | null>
  showOpenDialogApk: () => Promise<string | null>
  getPathForFile: (file: File) => string
}

const api: IElectronAPI = {
  getDevices: () => ipcRenderer.invoke('adb:getDevices'),
  connectDevice: (ip: string, port?: number) => ipcRenderer.invoke('adb:connect', ip, port),
  pairDevice: (ip: string, port: number, code: string) => ipcRenderer.invoke('adb:pair', ip, port, code),
  disconnectDevice: (serial: string) => ipcRenderer.invoke('adb:disconnect', serial),
  scanLan: (port?: number, subnet?: string) => ipcRenderer.invoke('adb:scanLan', port, subnet),
  getDeviceInfo: (serial: string) => ipcRenderer.invoke('adb:getDeviceInfo', serial),
  getInstalledApps: (serial: string) => ipcRenderer.invoke('adb:getInstalledApps', serial),
  getAppPid: (serial: string, pkg: string) => ipcRenderer.invoke('adb:getAppPid', serial, pkg),
  getAppPids: (serial: string, pkg: string) => ipcRenderer.invoke('adb:getAppPids', serial, pkg),
  installApk: (serial: string, localPath: string) => ipcRenderer.invoke('adb:installApk', serial, localPath),

  startLogcat: (serial: string) => ipcRenderer.invoke('logcat:start', serial),
  stopLogcat: () => ipcRenderer.invoke('logcat:stop'),
  clearLogcat: (serial?: string) => ipcRenderer.invoke('logcat:clear', serial),
  startRecordingLogcat: (filePath: string) => ipcRenderer.invoke('logcat:startRecording', filePath),
  stopRecordingLogcat: () => ipcRenderer.invoke('logcat:stopRecording'),
  getBufferedLogs: (filter?: LogcatFilterOptions) => ipcRenderer.invoke('logcat:getBufferedLogs', filter),
  onLogcatBatch: (callback: (entries: LogcatEntry[]) => void) => {
    const handler = (_e: IpcRendererEvent, entries: LogcatEntry[]) => callback(entries)
    ipcRenderer.on('logcat-batch', handler)
    return () => {
      ipcRenderer.removeListener('logcat-batch', handler)
    }
  },

  onRecordingError: (callback) => {
    const handler = (_e: IpcRendererEvent, message: string) => callback(message)
    ipcRenderer.on('logcat-recording-error', handler)
    return () => ipcRenderer.removeListener('logcat-recording-error', handler)
  },
  listFiles: (serial: string, dirPath?: string) => ipcRenderer.invoke('files:list', serial, dirPath),
  pushFile: (serial: string, localPath: string, remotePath: string) =>
    ipcRenderer.invoke('files:push', serial, localPath, remotePath),
  pullFile: (serial: string, remotePath: string, localPath: string) =>
    ipcRenderer.invoke('files:pull', serial, remotePath, localPath),
  transferFile: (task: FileTransferTask) => ipcRenderer.invoke('files:transfer', task),
  cancelFileTransfer: (taskId: string) => ipcRenderer.invoke('files:cancelTransfer', taskId),
  getLocalFileSize: (filePath: string) => ipcRenderer.invoke('file:stat', filePath),
  onFileTransferProgress: callback => {
    const handler = (_e: IpcRendererEvent, progress: { taskId: string; percent: number }) => callback(progress)
    ipcRenderer.on('file-transfer-progress', handler)
    return () => ipcRenderer.removeListener('file-transfer-progress', handler)
  },
  createDirectory: (serial: string, remotePath: string) => ipcRenderer.invoke('files:mkdir', serial, remotePath),
  deleteFile: (serial: string, remotePath: string) => ipcRenderer.invoke('files:rm', serial, remotePath),
  renameFile: (serial: string, oldPath: string, newPath: string) =>
    ipcRenderer.invoke('files:rename', serial, oldPath, newPath),

  createTerminal: (sessionId: string, serial: string) => ipcRenderer.invoke('terminal:create', sessionId, serial),
  writeTerminal: (sessionId: string, data: string) => ipcRenderer.invoke('terminal:write', sessionId, data),
  resizeTerminal: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', sessionId, cols, rows),
  closeTerminal: (sessionId: string) => ipcRenderer.invoke('terminal:close', sessionId),
  onTerminalData: (sessionId: string, callback: (data: string) => void) => {
    const channel = `terminal-data-${sessionId}`
    const handler = (_e: IpcRendererEvent, data: string) => callback(data)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },
  onTerminalExit: (sessionId: string, callback: () => void) => {
    const channel = `terminal-exit-${sessionId}`
    const handler = () => callback()
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },

  startPerf: (serial: string, pkg: string | null) => ipcRenderer.invoke('perf:start', serial, pkg),
  stopPerf: () => ipcRenderer.invoke('perf:stop'),
  onPerfSample: (callback: (sample: PerfMetricsSample) => void) => {
    const handler = (_e: IpcRendererEvent, sample: PerfMetricsSample) => callback(sample)
    ipcRenderer.on('perf-sample', handler)
    return () => {
      ipcRenderer.removeListener('perf-sample', handler)
    }
  },

  startScrcpy: (serial: string, options: ScrcpyOptions) => ipcRenderer.invoke('scrcpy:start', serial, options),
  stopScrcpy: () => ipcRenderer.invoke('scrcpy:stop'),
  sendScrcpyControl: (event: ScrcpyControlEvent) => ipcRenderer.invoke('scrcpy:control', event),
  takeScreenshot: (serial: string) => ipcRenderer.invoke('scrcpy:screenshot', serial),
  clipboardToDevice: () => ipcRenderer.invoke('scrcpy:clipboardToDevice'),
  clipboardToHost: () => ipcRenderer.invoke('scrcpy:clipboardToHost'),
  createDiagnosticBundle: (options: DiagnosticBundleOptions) => ipcRenderer.invoke('diagnostics:create', options),
  onScrcpyPacket: (callback: (packet: ScrcpyVideoPacket) => void) => {
    const handler = (_e: IpcRendererEvent, packet: ScrcpyVideoPacket) => callback(packet)
    ipcRenderer.on('scrcpy-packet', handler)
    return () => ipcRenderer.removeListener('scrcpy-packet', handler)
  },
  onScrcpySize: (callback: (size: { width: number; height: number }) => void) => {
    const handler = (_e: IpcRendererEvent, size: { width: number; height: number }) => callback(size)
    ipcRenderer.on('scrcpy-size', handler)
    return () => ipcRenderer.removeListener('scrcpy-size', handler)
  },
  onScrcpyStopped: (callback: (message: string) => void) => {
    const handler = (_e: IpcRendererEvent, message: string) => callback(message)
    ipcRenderer.on('scrcpy-stopped', handler)
    return () => {
      ipcRenderer.removeListener('scrcpy-stopped', handler)
    }
  },
  startMultiScrcpy: (serial, options) => ipcRenderer.invoke('multi:scrcpy:start', serial, options),
  stopMultiScrcpy: serial => ipcRenderer.invoke('multi:scrcpy:stop', serial),
  sendMultiScrcpyControl: (serial, event) => ipcRenderer.invoke('multi:scrcpy:control', serial, event),
  onMultiScrcpyPacket: callback => {
    const handler = (_e: IpcRendererEvent, payload: { serial: string; value: ScrcpyVideoPacket }) => callback(payload.serial, payload.value)
    ipcRenderer.on('multi-scrcpy-packet', handler)
    return () => ipcRenderer.removeListener('multi-scrcpy-packet', handler)
  },
  onMultiScrcpySize: callback => {
    const handler = (_e: IpcRendererEvent, payload: { serial: string; value: { width: number; height: number } }) => callback(payload.serial, payload.value)
    ipcRenderer.on('multi-scrcpy-size', handler)
    return () => ipcRenderer.removeListener('multi-scrcpy-size', handler)
  },
  onMultiScrcpyStopped: callback => {
    const handler = (_e: IpcRendererEvent, payload: { serial: string; value: string }) => callback(payload.serial, payload.value)
    ipcRenderer.on('multi-scrcpy-stopped', handler)
    return () => ipcRenderer.removeListener('multi-scrcpy-stopped', handler)
  },
  startMultiLogcat: serial => ipcRenderer.invoke('multi:logcat:start', serial),
  stopMultiLogcat: serial => ipcRenderer.invoke('multi:logcat:stop', serial),
  onMultiLogcatBatch: callback => {
    const handler = (_e: IpcRendererEvent, payload: { serial: string; entries: LogcatEntry[] }) => callback(payload.serial, payload.entries)
    ipcRenderer.on('multi-logcat-batch', handler)
    return () => ipcRenderer.removeListener('multi-logcat-batch', handler)
  },
  startMultiLogcatRecording: (serial, filePath) => ipcRenderer.invoke('multi:logcat:startRecording', serial, filePath),
  stopMultiLogcatRecording: serial => ipcRenderer.invoke('multi:logcat:stopRecording', serial),
  onMultiLogcatRecordingError: callback => {
    const handler = (_e: IpcRendererEvent, payload: { serial: string; message: string }) => callback(payload.serial, payload.message)
    ipcRenderer.on('multi-logcat-recording-error', handler)
    return () => ipcRenderer.removeListener('multi-logcat-recording-error', handler)
  },

  writeTextFile: (filePath, content) => ipcRenderer.invoke('file:writeText', filePath, content),
  readTextFile: (filePath) => ipcRenderer.invoke('file:readText', filePath),
  startVideoRecording: destination => ipcRenderer.invoke('recording:start', destination),
  appendVideoRecording: (id, bytes) => ipcRenderer.invoke('recording:append', id, bytes),
  finishVideoRecording: id => ipcRenderer.invoke('recording:finish', id),
  abortVideoRecording: id => ipcRenderer.invoke('recording:abort', id),
  captureTrace: (serial, destination, durationSeconds) => ipcRenderer.invoke('trace:capture', serial, destination, durationSeconds),
  inspectTrace: filePath => ipcRenderer.invoke('trace:inspect', filePath),
  openTraceViewer: () => ipcRenderer.invoke('trace:openViewer'),
  showSaveDialog: (defaultName: string) => ipcRenderer.invoke('dialog:saveFile', defaultName),
  showOpenDialogDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  showOpenDialogFile: () => ipcRenderer.invoke('dialog:openFile'),
  showOpenDialogApk: () => ipcRenderer.invoke('dialog:openApk'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('electronAPI', api)
