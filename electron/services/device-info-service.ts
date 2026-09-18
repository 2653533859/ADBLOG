import { adbService } from './adb-service'
import { DeviceDetailInfo } from '../../src/types'

export class DeviceInfoService {
  public async getDeviceInfo(serial: string): Promise<DeviceDetailInfo> {
    const sArgs = (cmd: string[]) => ['-s', serial, 'shell', ...cmd]

    const [propsOut, sizeOut, densityOut, batteryOut, ipOut] = await Promise.all([
      adbService.exec(sArgs(['getprop'])).catch(() => ''),
      adbService.exec(sArgs(['wm', 'size'])).catch(() => ''),
      adbService.exec(sArgs(['wm', 'density'])).catch(() => ''),
      adbService.exec(sArgs(['dumpsys', 'battery'])).catch(() => ''),
      adbService.exec(sArgs(['ip', 'addr', 'show', 'wlan0'])).catch(() => '')
    ])

    const propMap = new Map<string, string>()
    const propRegex = /\[(.*?)\]:\s*\[(.*?)\]/g
    let match: RegExpExecArray | null
    while ((match = propRegex.exec(propsOut)) !== null) {
      propMap.set(match[1], match[2])
    }

    const manufacturer = propMap.get('ro.product.manufacturer') || 'Android'
    const model = propMap.get('ro.product.model') || serial
    const brand = propMap.get('ro.product.brand') || manufacturer
    const androidVersion = propMap.get('ro.build.version.release') || 'Unknown'
    const sdkLevel = parseInt(propMap.get('ro.build.version.sdk') || '0', 10)
    const abi = propMap.get('ro.product.cpu.abi') || 'arm64-v8a'

    let screenResolution = '1080x1920'
    const sizeMatch = sizeOut.match(/Physical size:\s*(\d+x\d+)/i) || sizeOut.match(/(\d+x\d+)/)
    if (sizeMatch) screenResolution = sizeMatch[1]

    let screenDensity = '440 dpi'
    const densityMatch = densityOut.match(/Physical density:\s*(\d+)/i) || densityOut.match(/(\d+)/)
    if (densityMatch) screenDensity = `${densityMatch[1]} dpi`

    let batteryLevel = 100
    let isCharging = false
    const levelMatch = batteryOut.match(/level:\s*(\d+)/i)
    if (levelMatch) batteryLevel = parseInt(levelMatch[1], 10)

    const statusMatch = batteryOut.match(/status:\s*(\d+)/i)
    if (statusMatch && (statusMatch[1] === '2' || statusMatch[1] === '5')) {
      isCharging = true
    }

    let ipAddress = serial.includes(':') ? serial.split(':')[0] : '127.0.0.1'
    const ipMatch = ipOut.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/)
    if (ipMatch) ipAddress = ipMatch[1]

    let macAddress = '02:00:00:00:00:00'
    const macMatch = ipOut.match(/link\/ether\s+([0-9a-fA-F:]{17})/)
    if (macMatch) macAddress = macMatch[1]

    return {
      manufacturer,
      model,
      brand,
      androidVersion,
      sdkLevel,
      abi,
      screenResolution,
      screenDensity,
      batteryLevel,
      isCharging,
      ipAddress,
      macAddress
    }
  }
}

export const deviceInfoService = new DeviceInfoService()
