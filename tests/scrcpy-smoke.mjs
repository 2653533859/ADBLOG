import { readFile } from 'node:fs/promises'
import { AdbServerClient } from '@yume-chan/adb'
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp'
import { AdbScrcpyClient, AdbScrcpyOptionsLatest } from '@yume-chan/adb-scrcpy'
import { PushReadableStream } from '@yume-chan/stream-extra'

const serialArg = process.argv[2]
const server = new AdbServerClient(new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 }))
const devices = await server.getDevices(['device'])
const device = serialArg ? devices.find(item => item.serial === serialArg) : devices[0]
if (!device) throw new Error('No matching online Android device')

const adb = await server.createAdb({ serial: device.serial })
const bytes = new Uint8Array(await readFile('tools/scrcpy/scrcpy-server-v3.3.3'))
await AdbScrcpyClient.pushServer(adb, new PushReadableStream(async controller => {
  await controller.enqueue(bytes)
}), '/data/local/tmp/adblog-scrcpy-server.jar')

const options = new AdbScrcpyOptionsLatest({
  video: true, audio: false, control: true, videoCodec: 'h264',
  maxSize: 720, maxFps: 30, videoBitRate: 2_000_000,
  sendDeviceMeta: false, sendFrameMeta: true
})
const client = await AdbScrcpyClient.start(adb, '/data/local/tmp/adblog-scrcpy-server.jar', options)
const video = await client.videoStream
const reader = video.stream.getReader()
let configurations = 0
let frames = 0
let keyframes = 0
let bytesReceived = 0
const deadline = Date.now() + 5000
while (Date.now() < deadline && frames < 30) {
  const result = await Promise.race([
    reader.read(),
    new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 1000))
  ])
  if (result.timeout) continue
  if (result.done) break
  bytesReceived += result.value.data.byteLength
  if (result.value.type === 'configuration') configurations += 1
  else {
    frames += 1
    if (result.value.keyframe) keyframes += 1
  }
}
console.log(JSON.stringify({
  serial: device.serial,
  codec: video.metadata.codec,
  width: video.width,
  height: video.height,
  configurations,
  frames,
  keyframes,
  bytesReceived,
  controller: Boolean(client.controller)
}, null, 2))
reader.releaseLock()
await client.close()
if (!configurations || !frames || !video.width || !video.height || !client.controller) process.exitCode = 1
