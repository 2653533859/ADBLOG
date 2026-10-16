import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'

const port = Number(process.argv[2])
assert.ok(port, 'Usage: node electron-recording-close-smoke.mjs PORT')
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const target = targets.find(item => item.title === 'ADBlog Studio')
assert.ok(target, 'ADBlog window should be available')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolveOpen, reject) => {
  socket.addEventListener('open', resolveOpen, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let nextId = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const response = JSON.parse(event.data)
  pending.get(response.id)?.(response)
  pending.delete(response.id)
})
async function evaluate(expression) {
  const id = ++nextId
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  const response = await new Promise(resolveResult => pending.set(id, resolveResult))
  if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text)
  return response.result?.result?.value
}

const directory = await mkdtemp(join(tmpdir(), 'adblog-close-smoke-'))
try {
  const destination = join(directory, 'closing.webm')
  const id = await evaluate(`window.electronAPI.startVideoRecording(${JSON.stringify(destination)})`)
  assert.ok(id)
  await evaluate(`window.electronAPI.appendVideoRecording(${JSON.stringify(id)}, new Uint8Array([1, 2, 3]))`)
  assert.ok((await readdir(directory)).some(name => name.startsWith('.adblog-recording-')))
  await evaluate('setTimeout(() => window.close(), 100); true')
  let remaining = []
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise(wait => setTimeout(wait, 250))
    remaining = await readdir(directory)
    if (!remaining.length) break
  }
  assert.deepEqual(remaining, [], 'Closing the window should remove the unfinished recording directory')
  console.log('PASS Electron window close aborts an active recording and removes its temporary directory')
} finally {
  socket.close()
  const targetDirectory = resolve(directory)
  assert.ok(targetDirectory.startsWith(resolve(tmpdir()) + sep) && basename(targetDirectory).startsWith('adblog-close-smoke-'))
  await rm(targetDirectory, { recursive: true, force: true })
}
