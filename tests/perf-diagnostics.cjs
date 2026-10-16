const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const vm = require('node:vm')
const ts = require('typescript')

async function main() {
  let receiveSample = () => {}
  const api = {
    startPerf: () => {}, stopPerf: () => {},
    onPerfSample: callback => { receiveSample = callback; return () => { receiveSample = () => {} } }
  }
  const source = await fs.readFile('src/stores/perf.ts', 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext
  } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => name === 'pinia'
    ? { defineStore: (_id, definition) => definition } : require(name), window: { electronAPI: api } })
  const definition = exports.usePerfStore
  const store = definition.state()
  for (const [name, action] of Object.entries(definition.actions)) store[name] = action.bind(store)
  const sample = { timestamp: Date.now(), cpu: { appPercent: 20 } }
  store.startMonitoring('device-A', null)
  receiveSample(sample)
  store.stopMonitoring()
  assert.equal(store.getHistoryForDevice('device-A').length, 1)
  assert.equal(store.getHistoryForDevice('device-B').length, 0)
  store.startMonitoring('device-B', null)
  assert.equal(store.getHistoryForDevice('device-A').length, 0)
  store.clearHistory()
  assert.equal(store.getHistoryForDevice('device-B').length, 0)
  console.log('PASS diagnostic performance history stays scoped to its device')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
