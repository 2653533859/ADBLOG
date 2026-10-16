const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

async function loadService(filesystem = fs) {
  const source = await fs.readFile('electron/services/video-recording-service.ts', 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext
  } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name =>
    name === 'node:fs/promises' ? filesystem : require(name), console })
  return new exports.VideoRecordingService()
}

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adblog-recording-test-'))
  try {
    const service = await loadService()
    const destination = path.join(dir, 'capture.webm')
    const id = await service.start(destination)
    await Promise.all([
      service.append(id, Uint8Array.of(1, 2)),
      service.append(id, Uint8Array.of(3, 4))
    ])
    assert.equal(await service.finish(id), destination)
    assert.deepEqual([...await fs.readFile(destination)], [1, 2, 3, 4])
    const canceled = await service.start(path.join(dir, 'canceled.webm'))
    await service.append(canceled, Uint8Array.of(5))
    await service.abort(canceled)
    assert.equal((await fs.readdir(dir)).includes('canceled.webm'), false)

    const closingA = await service.start(path.join(dir, 'closing-a.webm'))
    const closingB = await service.start(path.join(dir, 'closing-b.webm'))
    await Promise.all([
      service.append(closingA, Uint8Array.of(6)),
      service.append(closingB, Uint8Array.of(7))
    ])
    assert.equal(service.hasActiveSessions(), true)
    await service.abortAll()
    assert.equal(service.hasActiveSessions(), false)
    assert.deepEqual((await fs.readdir(dir)).filter(name => name.startsWith('.adblog-recording-')), [])
    assert.equal((await fs.readdir(dir)).includes('closing-a.webm'), false)
    assert.equal((await fs.readdir(dir)).includes('closing-b.webm'), false)

    let byteCount = 0
    let renamed = false
    const fakeFs = {
      mkdtemp: async prefix => `${prefix}test`,
      open: async () => ({ writeFile: async bytes => { byteCount += bytes.byteLength }, close: async () => {} }),
      rename: async () => { renamed = true }, rm: async () => {}
    }
    const largeService = await loadService(fakeFs)
    const largeId = await largeService.start(path.join(dir, 'large.webm'))
    const block = new Uint8Array(4 * 1024 * 1024)
    for (let i = 0; i < 64; i++) await largeService.append(largeId, block)
    await largeService.finish(largeId)
    assert.equal(byteCount, 256 * 1024 * 1024)
    assert.equal(renamed, true)

    let completeRename
    const slowFs = {
      mkdtemp: async prefix => `${prefix}slow`,
      open: async () => ({ writeFile: async () => {}, close: async () => {} }),
      rename: async () => new Promise(resolve => { completeRename = resolve }),
      rm: async () => {}
    }
    const slowService = await loadService(slowFs)
    const slowId = await slowService.start(path.join(dir, 'slow.webm'))
    await slowService.append(slowId, Uint8Array.of(8))
    const finishing = slowService.finish(slowId)
    await new Promise(setImmediate)
    assert.equal(slowService.hasActiveSessions(), true)
    let cleanupFinished = false
    const cleanup = slowService.abortAll().then(() => { cleanupFinished = true })
    await new Promise(setImmediate)
    assert.equal(cleanupFinished, false)
    completeRename()
    await Promise.all([finishing, cleanup])
    assert.equal(slowService.hasActiveSessions(), false)
    console.log('PASS video recording ordered chunks, window-close cleanup and >250 MB output')
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
