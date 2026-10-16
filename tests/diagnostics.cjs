const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const yauzl = require('yauzl')

async function readZip(filename) {
  return new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error)
      const entries = new Map()
      zip.on('entry', entry => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError)
          const chunks = []
          stream.on('data', chunk => chunks.push(chunk))
          stream.on('error', reject)
          stream.on('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks))
            zip.readEntry()
          })
        })
      })
      zip.on('end', () => resolve(entries))
      zip.on('error', reject)
      zip.readEntry()
    })
  })
}

async function main() {
  const capturedAt = new Date()
  const stamp = `${String(capturedAt.getMonth() + 1).padStart(2, '0')}-${String(capturedAt.getDate()).padStart(2, '0')} ` +
    `${String(capturedAt.getHours()).padStart(2, '0')}:${String(capturedAt.getMinutes()).padStart(2, '0')}:` +
    `${String(capturedAt.getSeconds()).padStart(2, '0')}.${String(capturedAt.getMilliseconds()).padStart(3, '0')}`
  const mocks = {
    archiver: await import('archiver'),
    './adb-service': { adbService: { getDevices: async () => [{ serial: 'USB', status: 'online' }] } },
    './device-info-service': { deviceInfoService: { getDeviceInfo: async () => ({ model: 'Test Device' }) } },
    './logcat-service': { logcatService: { getBufferedLogsForSerial: serial => serial === 'USB' ? [{ timestamp: stamp, raw: 'TEST LOG' }] : [] } },
    './scrcpy-service': { scrcpyService: { captureSingleScreenshot: async () =>
      `data:image/png;base64,${Buffer.from('PNG').toString('base64')}` } }
  }
  const source = await fs.readFile('electron/services/diagnostic-service.ts', 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => mocks[name] || require(name), Buffer, console, process })
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adblog-diagnostic-test-'))
  try {
    const destination = path.join(dir, 'diagnostics.zip')
    const result = await new exports.DiagnosticService().createBundle({
      serial: 'USB', destination, lastMinutes: 5, includeBugreport: false,
      perfSamples: [{ timestamp: Date.now(), cpu: { appPercent: 10 } }]
    })
    assert.equal(result.path, destination)
    const entries = await readZip(destination)
    assert.deepEqual([...entries.keys()].sort(), ['device.json', 'logcat.txt', 'manifest.json', 'performance.json', 'screenshot.png'])
    assert.match(entries.get('logcat.txt').toString(), /TEST LOG/)
    assert.equal(entries.get('screenshot.png').toString(), 'PNG')
    assert.equal(JSON.parse(entries.get('device.json')).details.model, 'Test Device')
    assert.equal(JSON.parse(entries.get('performance.json')).length, 1)
    console.log('PASS diagnostic ZIP contents and time-scoped data')
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
