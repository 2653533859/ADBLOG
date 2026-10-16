const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const vm = require('node:vm')
const ts = require('typescript')

async function main() {
  const source = await fs.readFile('src/stores/files.ts', 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext
  } }).outputText
  const selected = { selectedSerial: 'A' }
  let finishTransfer
  let finishOldList
  const lists = []
  const api = {
    transferFile: () => new Promise(resolve => { finishTransfer = resolve }),
    listFiles: (serial, path) => {
      lists.push([serial, path])
      if (serial === 'A') return new Promise(resolve => { finishOldList = resolve })
      return Promise.resolve([{ name: 'from-B', path: '/sdcard/from-B' }])
    }
  }
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => {
    if (name === 'pinia') return { defineStore: (_name, definition) => definition }
    if (name === './device') return { useDeviceStore: () => selected }
    return require(name)
  }, window: { electronAPI: api }, performance: { now: () => 1000 } })
  const definition = exports.useFileStore
  const store = definition.state()
  for (const [name, action] of Object.entries(definition.actions)) store[name] = action.bind(store)

  const oldLoad = store.loadPath('A', '/sdcard')
  selected.selectedSerial = 'B'
  await store.loadPath('B', '/sdcard')
  finishOldList([{ name: 'from-A', path: '/sdcard/from-A' }])
  await oldLoad
  assert.equal(store.files[0].name, 'from-B')

  selected.selectedSerial = 'A'
  store.transfers.push({ taskId: 'upload-A', serial: 'A', direction: 'push', remotePath: '/sdcard',
    localPath: 'input.txt', totalBytes: 10, transferredBytes: 0, status: 'pending' })
  const queue = store.runTransferQueue()
  selected.selectedSerial = 'B'
  finishTransfer({ success: true, message: 'done' })
  await queue
  assert.deepEqual(lists.map(item => item[0]), ['A', 'B'])
  assert.equal(store.files[0].name, 'from-B')
  console.log('PASS stale file listing and completed upload cannot replace another device view')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
