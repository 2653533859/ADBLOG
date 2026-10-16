import assert from 'node:assert/strict'

const port = Number(process.argv[2] || 9238)
const serial = process.argv[3]
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const target = targets.find(item => item.title === 'ADBlog Studio')
if (!target) throw new Error('ADBlog Studio CDP target not found')
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
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate',
    params: { expression, awaitPromise: true, returnByValue: true } }))
  const response = await new Promise(resolve => pending.set(id, resolve))
  if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text)
  return response.result?.result?.value
}

try {
  if (serial) await evaluate(`(async () => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const select = document.querySelector('select')
      const option = select?.querySelector('option[value=${JSON.stringify(serial)}]')
      if (select && option) {
        select.value = ${JSON.stringify(serial)}
        select.dispatchEvent(new Event('change', { bubbles: true }))
        return
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('Requested device was not available')
  })()`)
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent?.includes('投屏'))?.click()`)
  await new Promise(resolve => setTimeout(resolve, 350))
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent?.includes('开始投屏'))?.click()`)
  let result
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 250))
    result = await evaluate(`(() => {
      const canvas = document.querySelector('canvas')
      const context = canvas?.getContext('webgl2') || canvas?.getContext('webgl')
      return { preserveDrawingBuffer: context?.getContextAttributes()?.preserveDrawingBuffer,
        width: canvas?.width, height: canvas?.height }
    })()`)
    if (result?.preserveDrawingBuffer && result.width > 300 && result.height > 150) break
  }
  assert.equal(result?.preserveDrawingBuffer, true)
  assert.ok(result.width > 300 && result.height > 150, 'Video canvas did not receive device dimensions')
  console.log(`PASS live WebGL canvas capture enabled (${result.width}x${result.height})`)
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent?.includes('停止投屏'))?.click()`)
} finally { socket.close() }
