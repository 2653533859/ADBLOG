export interface DeviceItem {
  serial: string;
  ip: string;
  port: number;
  status: 'online' | 'offline' | 'unauthorized' | 'connecting';
  connectionType: 'wifi' | 'usb';
  model?: string;
  brand?: string;
  manufacturer?: string;
  androidVersion?: string;
  sdkLevel?: number;
  abi?: string;
  batteryLevel?: number;
}

export interface DeviceDetailInfo {
  manufacturer: string;
  model: string;
  brand: string;
  androidVersion: string;
  sdkLevel: number;
  abi: string;
  screenResolution: string;
  screenDensity: string;
  batteryLevel: number;
  isCharging: boolean;
  ipAddress: string;
  macAddress: string;
}

export interface AppItem {
  packageName: string;
  appName: string;
  isSystemApp: boolean;
  versionName?: string;
  versionCode?: number;
  pid?: number | null;
}

export interface ApkInstallResult {
  success: boolean;
  message: string;
}

export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'A';

export interface LogcatEntry {
  id: number;
  timestamp: string;
  pid: number;
  tid: number;
  level: LogLevel;
  tag: string;
  message: string;
  raw: string;
}

export interface LogSession {
  format: 'adblog-log-session-v1';
  savedAt: string;
  serial: string;
  selectedPackage: string | null;
  filter: LogcatFilterOptions;
  entries: LogcatEntry[];
  bookmarkedIds: number[];
  incidents?: IncidentEvent[];
  performanceSamples?: PerfMetricsSample[];
  timelineEvents?: TimelineEvent[];
}

export interface IncidentEvent {
  id: string;
  serial: string;
  kind: 'crash' | 'anr' | 'native-crash';
  occurredAt: number;
  logId: number;
  pid: number;
  title: string;
  signature: string;
  excerpt: string[];
}

export interface TimelineEvent {
  id: string;
  serial: string;
  at: number;
  kind: 'bookmark' | 'recording-start' | 'recording-end' | 'note';
  title: string;
  detail?: string;
  logId?: number;
}

export interface LogcatFilterOptions {
  targetPids: number[] | null;
  pid: number | null;
  minLevel: LogLevel;
  keyword: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  tag: string;
  excludeTags: string[];
}

export interface ScrcpyOptions {
  maxSize: number;
  bitRate: number;
  maxFps: number;
  stayAwake: boolean;
  turnScreenOff: boolean;
}

export type ScrcpyControlEvent =
  | { type: 'touch'; action: 'down' | 'move' | 'up'; x: number; y: number; width: number; height: number }
  | { type: 'scroll'; x: number; y: number; width: number; height: number; deltaX: number; deltaY: number }
  | { type: 'key'; action: 'down' | 'up'; key: string }
  | { type: 'text'; text: string }
  | { type: 'command'; command: 'home' | 'back' | 'app-switch' | 'power' | 'rotate'; width?: number; height?: number }

export interface ScrcpyVideoPacket {
  type: 'configuration' | 'data';
  keyframe?: boolean;
  pts?: string;
  data: Uint8Array;
}

export interface RemoteFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  permissions: string;
  modifyTime: number;
  ext?: string;
}

export interface FileTransferTask {
  taskId: string;
  serial: string;
  direction: 'push' | 'pull';
  localPath: string;
  remotePath: string;
  totalBytes: number;
  transferredBytes: number;
  speedBps: number;
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'canceled';
  error?: string;
}

export interface PerfMetricsSample {
  timestamp: number;
  cpu: {
    appPercent: number;
    systemPercent: number;
  };
  memory: {
    totalPss: number;
    javaHeapPss: number;
    nativeHeapPss: number;
    graphicsPss: number;
    privateDirty: number;
  };
  fps: {
    currentFps: number;
    jankCount: number;
    frameTimeMs: number;
  };
  network: {
    rxBytesPerSec: number;
    txBytesPerSec: number;
  };
  battery: {
    level: number;
    temperature: number;
  };
}

export interface ScanResult {
  ip: string;
  port: number;
  status: 'online';
  hostname?: string;
}

export interface ShellSession {
  id: string;
  title: string;
  serial: string;
}
