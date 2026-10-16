const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const mirrorCalls = []
const logCalls = []
class FakeScrcpyService {
  constructor(serial, onEnded) { this.serial = serial; this.onEnded = onEnded }
  async startStream(serial, options) {
    mirrorCalls.push(['start', this.serial, serial, options.maxSize])
    return { success: true, message: 'started' }
  }
  async stopStream() { mirrorCalls.push(['stop', this.serial]) }
  async sendControl(event) { mirrorCalls.push(['control', this.serial, event.command]) }
}
class FakeLogcatService {
  constructor(serial, maxBufferSize) { this.serial = serial; logCalls.push(['new', serial, maxBufferSize]) }
  start(serial) { logCalls.push(['start', this.serial, serial]) }
  stop() { logCalls.push(['stop', this.serial]) }
  async startRecording(path, append) { logCalls.push(['record', this.serial, path, append]); return true }
  stopRecording() { logCalls.push(['stopRecord', this.serial]) }
}
const code = ts.transpileModule(fs.readFileSync('electron/services/multi-device-service.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext }
}).outputText
const loaded = {}
vm.runInNewContext(code, {
  exports: loaded,
  require: name => {
    if (name === './scrcpy-service') return { ScrcpyService: FakeScrcpyService }
    if (name === './logcat-service') return { LogcatService: FakeLogcatService }
    throw new Error(`Unexpected import: ${name}`)
  }
})

async function main() {
  const service = new loaded.MultiDeviceService()
  const window = {}
  const options = { maxSize: 1920 }
  await service.startMirror('USB-A', options, window)
  await service.startMirror('USB-B', options, window)
  service.startLogs('USB-A', window)
  service.startLogs('USB-B', window)
  assert.equal(await service.startLogRecording('USB-A', 'A.log'), true)
  assert.equal(await service.startLogRecording('USB-B', 'B.log'), true)
  service.stopLogRecording('USB-A')
  await service.sendControl('USB-B', { type: 'command', command: 'home' })
  await service.stopMirror('USB-A')
  service.stopLogs('USB-A')
  await service.sendControl('USB-B', { type: 'command', command: 'back' })
  assert.deepEqual(mirrorCalls, [
    ['start', 'USB-A', 'USB-A', 1920],
    ['start', 'USB-B', 'USB-B', 1920],
    ['control', 'USB-B', 'home'],
    ['stop', 'USB-A'],
    ['control', 'USB-B', 'back']
  ])
  assert.deepEqual(logCalls, [
    ['new', 'USB-A', 5000], ['start', 'USB-A', 'USB-A'],
    ['new', 'USB-B', 5000], ['start', 'USB-B', 'USB-B'],
    ['record', 'USB-A', 'A.log', false], ['record', 'USB-B', 'B.log', false],
    ['stopRecord', 'USB-A'],
    ['stop', 'USB-A']
  ])
  await service.startMirror('USB-C', options, window)
  await service.startMirror('USB-D', options, window)
  await service.startMirror('USB-E', options, window)
  assert.equal((await service.startMirror('USB-F', options, window)).success, false)
  service.startLogs('USB-C', window)
  service.startLogs('USB-D', window)
  service.startLogs('USB-E', window)
  assert.throws(() => service.startLogs('USB-F', window), /最多同时查看 4 台/)
  service.stopAll()
  console.log('PASS independent per-device mirror and log lifecycle, routing, and four-device limit')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
