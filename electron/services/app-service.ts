import { adbService } from './adb-service'
import { stat } from 'node:fs/promises'
import * as path from 'node:path'
import { ApkInstallResult, AppItem } from '../../src/types'

export class AppService {
  private formatAppName(pkg: string): string {
    const parts = pkg.split('.')
    const last = parts[parts.length - 1]
    if (last.length > 2) {
      return last.charAt(0).toUpperCase() + last.slice(1)
    }
    return pkg
  }

  public async getInstalledApps(serial: string): Promise<AppItem[]> {
    try {
      const [thirdPartyOut, systemOut] = await Promise.all([
        adbService.exec(['-s', serial, 'shell', 'pm', 'list', 'packages', '-3', '-f']).catch(() => ''),
        adbService.exec(['-s', serial, 'shell', 'pm', 'list', 'packages', '-s', '-f']).catch(() => '')
      ])

      const apps: AppItem[] = []
      const seenPackages = new Set<string>()

      const parsePackages = (output: string, isSystem: boolean): void => {
        const lines = output.split('\n').map(l => l.trim()).filter(Boolean)
        for (const line of lines) {
          if (!line.startsWith('package:')) continue
          const raw = line.replace('package:', '')
          const eqIdx = raw.lastIndexOf('=')
          let pkg = raw
          if (eqIdx !== -1) {
            pkg = raw.slice(eqIdx + 1).trim()
          }
          if (pkg && !seenPackages.has(pkg)) {
            seenPackages.add(pkg)
            apps.push({
              packageName: pkg,
              appName: this.formatAppName(pkg),
              isSystemApp: isSystem
            })
          }
        }
      }

      parsePackages(thirdPartyOut, false)
      parsePackages(systemOut, true)

      return apps.sort((a, b) => {
        if (a.isSystemApp !== b.isSystemApp) {
          return a.isSystemApp ? 1 : -1
        }
        return a.appName.localeCompare(b.appName)
      })
    } catch (err: unknown) {
      console.error('[AppService] Failed to list packages:', err)
      return []
    }
  }

  public async getAppPid(serial: string, packageName: string): Promise<number | null> {
    try {
      const out = await adbService.exec(['-s', serial, 'shell', 'pidof', packageName], 3000)
      const pids = out.trim().split(/\s+/).filter(Boolean)
      if (pids.length > 0) {
        const parsed = parseInt(pids[0], 10)
        return Number.isNaN(parsed) ? null : parsed
      }
      return null
    } catch {
      return null
    }
  }

  public async installApk(serial: string, localPath: string): Promise<ApkInstallResult> {
    if (path.extname(localPath).toLowerCase() !== '.apk') {
      return { success: false, message: '请选择扩展名为 .apk 的安装包。' }
    }

    try {
      const file = await stat(localPath)
      if (!file.isFile()) return { success: false, message: 'APK 路径不是有效文件。' }
      const output = await adbService.exec(['-s', serial, 'install', '-r', '-t', localPath], 5 * 60 * 1000)
      if (!/\bSuccess\b/i.test(output)) {
        return { success: false, message: output || 'ADB 未返回安装成功状态。' }
      }
      return { success: true, message: output }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, message: message || 'APK 安装失败。' }
    }
  }
}

export const appService = new AppService()
