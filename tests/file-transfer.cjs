const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

async function main() {
  const children = []
  const adbService = { spawn(args) {
    const proc = new EventEmitter()
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.args = args
    proc.kill = () => { queueMicrotask(() => proc.emit('close', 1)); return true }
    children.push(proc)
    return proc
  } }
  const source = await fs.readFile('electron/services/file-service.ts', 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext
  } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => name === './adb-service' ? { adbService } : require(name),
    console, setTimeout, clearTimeout, Buffer })
  const events = []
  const window = { isDestroyed: () => false, webContents: { send: (...args) => events.push(args) } }
  const service = new exports.FileService()
  const task = { taskId: 'one', serial: 'USB', direction: 'push', localPath: 'file.txt', remotePath: '/sdcard' }
  const first = service.transfer(task, window)
  assert.deepEqual([...children[0].args], ['-s', 'USB', 'push', '-p', 'file.txt', '/sdcard'])
  children[0].stderr.emit('data', Buffer.from('[ 42%] file.txt'))
  children[0].emit('close', 0)
  assert.equal((await first).success, true)
  assert.equal(JSON.stringify(events[0]), JSON.stringify(['file-transfer-progress', { taskId: 'one', percent: 42 }]))

  const second = service.transfer({ ...task, taskId: 'two' }, window)
  assert.equal(service.cancelTransfer('two'), true)
  assert.equal((await second).canceled, true)
  assert.equal(service.cancelTransfer('two'), false)
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adblog-file-transfer-'))
  try {
    const destination = path.join(dir, 'download.txt')
    await fs.writeFile(destination, 'original')
    const pull = taskId => service.transfer({ taskId, serial: 'USB', direction: 'pull',
      remotePath: '/sdcard/download.txt', localPath: destination }, window)

    const canceledPull = pull('pull-canceled')
    const canceledTemp = children.at(-1).args.at(-1)
    assert.equal(path.dirname(canceledTemp), dir)
    assert.notEqual(canceledTemp, destination)
    await fs.writeFile(canceledTemp, 'partial')
    assert.equal(service.cancelTransfer('pull-canceled'), true)
    assert.equal((await canceledPull).canceled, true)
    assert.equal(await fs.readFile(destination, 'utf8'), 'original')
    await assert.rejects(fs.stat(canceledTemp), { code: 'ENOENT' })

    const failedPull = pull('pull-failed')
    const failedTemp = children.at(-1).args.at(-1)
    await fs.writeFile(failedTemp, 'partial')
    children.at(-1).emit('close', 1)
    assert.equal((await failedPull).success, false)
    assert.equal(await fs.readFile(destination, 'utf8'), 'original')
    await assert.rejects(fs.stat(failedTemp), { code: 'ENOENT' })

    const successfulPull = pull('pull-success')
    const successfulTemp = children.at(-1).args.at(-1)
    await fs.writeFile(successfulTemp, 'complete')
    children.at(-1).emit('close', 0)
    assert.equal((await successfulPull).success, true)
    assert.equal(await fs.readFile(destination, 'utf8'), 'complete')
    await assert.rejects(fs.stat(successfulTemp), { code: 'ENOENT' })
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep))
    await fs.rm(dir, { recursive: true, force: true })
  }
  console.log('PASS file transfer progress, cancellation, and atomic download replacement')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
