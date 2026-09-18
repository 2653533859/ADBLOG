import * as net from 'net'
import * as os from 'os'
import { ScanResult } from '../../src/types'
import { adbService } from './adb-service'

export class DiscoveryService {
  private getLocalSubnets(): string[] {
    const interfaces = os.networkInterfaces()
    const subnets: string[] = []

    for (const name of Object.keys(interfaces)) {
      const netList = interfaces[name]
      if (!netList) continue

      for (const info of netList) {
        if (info.family === 'IPv4' && !info.internal && info.address) {
          const parts = info.address.split('.')
          if (parts.length === 4) {
            const subnetPrefix = `${parts[0]}.${parts[1]}.${parts[2]}`
            if (!subnets.includes(subnetPrefix)) {
              subnets.push(subnetPrefix)
            }
          }
        }
      }
    }

    return subnets
  }

  public probePort(ip: string, port = 5555, timeout = 250): Promise<boolean> {
    const { promise, resolve } = Promise.withResolvers<boolean>()
    const socket = new net.Socket()

    let hasResolved = false
    const finish = (result: boolean): void => {
      if (!hasResolved) {
        hasResolved = true
        socket.destroy()
        resolve(result)
      }
    }

    socket.setTimeout(timeout)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))

    try {
      socket.connect(port, ip)
    } catch {
      finish(false)
    }

    return promise
  }

  public probeAdb(ip: string, port = 5555, timeout = 700): Promise<boolean> {
    const { promise, resolve } = Promise.withResolvers<boolean>()
    const socket = new net.Socket()
    let received = Buffer.alloc(0)
    let hasResolved = false
    const finish = (result: boolean): void => {
      if (hasResolved) return
      hasResolved = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeout)
    socket.once('connect', () => {
      const command = 0x4e584e43 // CNXN
      const payload = Buffer.from('host::\0')
      const packet = Buffer.alloc(24 + payload.length)
      packet.writeUInt32LE(command, 0)
      packet.writeUInt32LE(0x01000001, 4)
      packet.writeUInt32LE(1024 * 1024, 8)
      packet.writeUInt32LE(payload.length, 12)
      packet.writeUInt32LE(payload.reduce((sum, byte) => sum + byte, 0) >>> 0, 16)
      packet.writeUInt32LE((command ^ 0xffffffff) >>> 0, 20)
      payload.copy(packet, 24)
      socket.write(packet)
    })
    socket.on('data', chunk => {
      received = Buffer.concat([received, chunk])
      if (received.length < 24) return
      const command = received.readUInt32LE(0)
      const length = received.readUInt32LE(12)
      const magic = received.readUInt32LE(20)
      const validHeader = magic === ((command ^ 0xffffffff) >>> 0) && length <= 1024 * 1024
      const isAdbResponse = command === 0x4e584e43 || command === 0x48545541 // CNXN or AUTH
      finish(validHeader && isAdbResponse)
    })
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))

    try {
      socket.connect(port, ip)
    } catch {
      finish(false)
    }
    return promise
  }

  public async scanLan(port = 5555, customSubnet?: string): Promise<ScanResult[]> {
    const subnets = customSubnet ? [customSubnet] : this.getLocalSubnets()
    const adbCandidates: { ip: string; port: number }[] = []

    for (const subnet of subnets) {
      const ips: string[] = []
      for (let i = 1; i <= 254; i++) {
        ips.push(`${subnet}.${i}`)
      }

      const concurrency = 40
      for (let i = 0; i < ips.length; i += concurrency) {
        const batch = ips.slice(i, i + concurrency)
        const checkPromises = batch.map(async (ip) => {
          const isOpen = await this.probePort(ip, port, 300)
          if (isOpen && await this.probeAdb(ip, port)) adbCandidates.push({ ip, port })
        })
        await Promise.all(checkPromises)
      }
    }

    if (adbCandidates.length === 0) return []

    const connectedBeforeScan = new Set((await adbService.getDevices()).map(device => device.serial))
    const connectionResults = new Map<string, boolean>()
    const verifyConcurrency = 4
    for (let i = 0; i < adbCandidates.length; i += verifyConcurrency) {
      const batch = adbCandidates.slice(i, i + verifyConcurrency)
      await Promise.all(batch.map(async candidate => {
        const serial = `${candidate.ip}:${candidate.port}`
        const result = await adbService.connect(candidate.ip, candidate.port)
        connectionResults.set(serial, result.success)
      }))
    }

    const devices = await adbService.getDevices()
    const foundDevices = adbCandidates.flatMap(candidate => {
      const serial = `${candidate.ip}:${candidate.port}`
      const device = devices.find(item => item.serial === serial)
      if (!connectionResults.get(serial) || device?.status !== 'online') return []
      return [{ ip: candidate.ip, port: candidate.port, status: 'online' as const, hostname: device.model }]
    })

    await Promise.all(adbCandidates
      .filter(candidate => !connectedBeforeScan.has(`${candidate.ip}:${candidate.port}`))
      .map(candidate => adbService.disconnect(`${candidate.ip}:${candidate.port}`)))

    return foundDevices
  }
}

export const discoveryService = new DiscoveryService()
