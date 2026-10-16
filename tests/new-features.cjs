const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const vm = require('node:vm')
const ts = require('typescript')

async function moduleAt(filename, mocks, globals = {}) {
  const source = await fs.readFile(filename, 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => mocks[name] || require(name), ...globals })
  return exports
}
function storeOf(definition) {
  const store = definition.state()
  for (const [name, method] of Object.entries(definition.actions)) store[name] = method.bind(store)
  return store
}

async function main() {
  const detect = await moduleAt('src/utils/incident-detection.ts', {})
  const entry = (id, tag, message) => ({ id, timestamp: '10-13 10:20:30.123', pid: 42, tag, message, raw: `${tag}: ${message}` })
  assert.equal(detect.classifyIncident('usb-1', entry(1, 'AndroidRuntime', 'FATAL EXCEPTION: main')).kind, 'crash')
  assert.equal(detect.classifyIncident('usb-1', entry(2, 'ActivityManager', 'ANR in com.example')).kind, 'anr')
  assert.equal(detect.classifyIncident('usb-1', entry(3, 'libc', 'Fatal signal 11 (SIGSEGV)')).kind, 'native-crash')
  assert.equal(detect.classifyIncident('usb-1', entry(4, 'Test', 'normal output')), null)
  const incidentDefinition = (await moduleAt('src/stores/incidents.ts', {
    pinia: { defineStore: (_name, definition) => definition }, '../utils/incident-detection': detect
  })).useIncidentStore
  const incidents = storeOf(incidentDefinition)
  const created = incidents.ingest('usb-1', [entry(1, 'AndroidRuntime', 'FATAL EXCEPTION: main'),
    entry(2, 'AndroidRuntime', 'java.lang.IllegalStateException: bad state')])
  assert.equal(created.length, 1)
  assert.match(incidents.forDevice('usb-1')[0].signature, /IllegalStateException/)
  assert.equal(incidents.forDevice('usb-2').length, 0)

  const calls = []
  let now = 1_000_000
  let failNextCapture = false
  const storage = new Map()
  const captureDefinition = (await moduleAt('src/stores/capture-rules.ts', {
    pinia: { defineStore: (_name, definition) => definition }, './perf': { usePerfStore: () => ({ getHistoryForDevice: () => [] }) },
    './timeline': { useTimelineStore: () => ({ add: () => {} }) }
  }, { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    Date: { now: () => now },
    window: { electronAPI: { createDiagnosticBundle: async options => {
      calls.push(options)
      if (failNextCapture) { failNextCapture = false; throw new Error('temporary failure') }
      return { path: options.destination }
    } } } })).useCaptureRulesStore
  const rules = storeOf(captureDefinition)
  rules.enabled = true; rules.folder = 'C:\\captures'; rules.onIncident = true; rules.cooldownSeconds = 60
  await rules.handleBatch('usb-1', [], created)
  await rules.handleBatch('usb-1', [], created)
  await rules.handleBatch('usb-2', [], [{ ...created[0], serial: 'usb-2' }])
  assert.equal(calls.length, 2)
  assert.equal(calls[0].serial, 'usb-1')
  assert.equal(calls[1].serial, 'usb-2')
  assert.match(calls[0].destination, /ADBlog-auto-\d+\.zip$/)
  failNextCapture = true
  await rules.handleBatch('usb-3', [], [{ ...created[0], serial: 'usb-3' }])
  assert.equal(rules.lastCaptureAt['usb-3'], undefined)
  assert.equal(rules.lastFailureAt['usb-3'], now)
  now += 4_000
  await rules.handleBatch('usb-3', [], [{ ...created[0], serial: 'usb-3' }])
  assert.equal(calls.length, 3)
  now += 2_000
  await rules.handleBatch('usb-3', [], [{ ...created[0], serial: 'usb-3' }])
  assert.equal(calls.length, 4)
  assert.equal(rules.lastCaptureAt['usb-3'], now)

  const adbCalls = []
  let size = 128
  const trace = await moduleAt('electron/services/trace-service.ts', {
    crypto: { randomUUID: () => 'test-id' },
    'fs/promises': { rename: async () => {}, rm: async () => {}, stat: async () => ({ size, isFile: () => true }) },
    './adb-service': { adbService: { exec: async args => { adbCalls.push(args) } } }
  })
  const result = await trace.traceService.capture('usb-1', 'C:\\capture.perfetto-trace', 5)
  assert.equal(result.bytes, 128)
  assert.equal(adbCalls[0][3], 'perfetto')
  assert.equal(adbCalls[1][2], 'pull')
  assert.equal(adbCalls[2][3], 'rm')
  await assert.rejects(trace.traceService.capture('usb-1', 'out', 61), /无效/)
  size = 0
  await assert.rejects(trace.traceService.inspect('trace.pftrace'), /无效|为空/)
  console.log('PASS incident detection, device-scoped capture rules, and Perfetto trace workflow')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
