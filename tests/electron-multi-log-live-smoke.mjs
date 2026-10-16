import assert from 'node:assert/strict'
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const [portArg, firstSerial, secondSerial] = process.argv.slice(2)
assert.ok(portArg && firstSerial && secondSerial, 'Usage: node electron-multi-log-live-smoke.mjs PORT SERIAL_A SERIAL_B')
const targets = await (await fetch(`http://127.0.0.1:${Number(portArg)}/json`)).json()
const target = targets.find(item => item.title === 'ADBlog Studio')
assert.ok(target, 'ADBlog window should be available')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
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
  const response = await new Promise(resolve => pending.set(id, resolve))
  if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text)
  return response.result?.result?.value
}
async function until(predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error('Timed out waiting for both device cards')
}

const temp = await mkdtemp(join(tmpdir(), 'adblog-multi-smoke-'))
const firstFile = join(temp, 'first.log')
const secondFile = join(temp, 'second.log')
try {
  await until(async () => await evaluate(`document.querySelector('aside button[title="多设备投屏与日志"]') !== null`), 10000)
  await evaluate(`document.querySelector('aside button[title="多设备投屏与日志"]').click()`)
  await until(async () => await evaluate(`(() => {
    const cards = [...document.querySelectorAll('main article')];
    return cards.length >= 2 && cards.some(card => card.textContent.includes(${JSON.stringify(firstSerial)})) &&
      cards.some(card => card.textContent.includes(${JSON.stringify(secondSerial)}));
  })()`))
  await evaluate(`(() => {
    for (const card of document.querySelectorAll('main article')) {
      const input = card.querySelector('input[placeholder^="搜索当前设备日志"]');
      if (input) { input.value = 'ADBlogMultiSmoke'; input.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  })()`)
  const started = await evaluate(`Promise.all([
    window.electronAPI.startMultiLogcatRecording(${JSON.stringify(firstSerial)}, ${JSON.stringify(firstFile)}),
    window.electronAPI.startMultiLogcatRecording(${JSON.stringify(secondSerial)}, ${JSON.stringify(secondFile)})
  ])`)
  assert.deepEqual(started, [true, true])
  const nonce = Date.now().toString(36)
  const firstMarker = `ADBlog_A_${nonce}`
  const secondMarker = `ADBlog_B_${nonce}`
  for (const [serial, marker] of [[firstSerial, firstMarker], [secondSerial, secondMarker]]) {
    const result = spawnSync('adb', ['-s', serial, 'shell', 'log', '-t', 'ADBlogMultiSmoke', marker], { encoding: 'utf8' })
    assert.equal(result.status, 0, `${serial}: ${result.stderr}`)
  }
  await new Promise(resolve => setTimeout(resolve, 900))
  const cards = await evaluate(`(() => [...document.querySelectorAll('main article')].map(card => ({
    serial: card.querySelector('header .font-mono')?.textContent?.trim(),
    text: card.textContent.includes('ADBlogMultiSmoke'),
    canvasWidth: card.querySelector('canvas')?.width
  })))()`)
  assert.ok(cards.some(card => card.serial === firstSerial && card.text), 'first device should display its log')
  assert.ok(cards.some(card => card.serial === secondSerial && card.text), 'second device should display its log')
  await evaluate(`Promise.all([
    window.electronAPI.stopMultiLogcatRecording(${JSON.stringify(firstSerial)}),
    window.electronAPI.stopMultiLogcatRecording(${JSON.stringify(secondSerial)})
  ])`)
  await new Promise(resolve => setTimeout(resolve, 300))
  const [firstText, secondText] = await Promise.all([readFile(firstFile, 'utf8'), readFile(secondFile, 'utf8')])
  assert.ok(firstText.includes(firstMarker) && !firstText.includes(secondMarker), 'first file should contain only first device marker')
  assert.ok(secondText.includes(secondMarker) && !secondText.includes(firstMarker), 'second file should contain only second device marker')
  console.log(`PASS two live devices display separate logs and save separate local files; canvases: ${cards.map(card => `${card.serial}=${card.canvasWidth}`).join(', ')}`)
  await unlink(firstFile)
  await unlink(secondFile)
  await rmdir(temp)
} finally {
  await evaluate(`Promise.allSettled([
    window.electronAPI.stopMultiLogcatRecording(${JSON.stringify(firstSerial)}),
    window.electronAPI.stopMultiLogcatRecording(${JSON.stringify(secondSerial)})
  ])`).catch(() => undefined)
  socket.close()
}
