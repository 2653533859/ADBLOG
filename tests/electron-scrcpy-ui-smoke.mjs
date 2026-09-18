const targets = await (await fetch('http://127.0.0.1:9223/json')).json()
const target = targets.find(item => item.title === 'ADBlog Studio')
if (!target) throw new Error('ADBlog Studio CDP target not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let id = 0
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  pending.get(message.id)?.(message)
  pending.delete(message.id)
})
function command(method, params = {}) {
  const commandId = ++id
  socket.send(JSON.stringify({ id: commandId, method, params }))
  return new Promise(resolve => pending.set(commandId, resolve))
}
async function evaluate(expression, awaitPromise = true) {
  const response = await command('Runtime.evaluate', {
    expression, awaitPromise, returnByValue: true
  })
  if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text)
  return response.result?.result?.value
}

await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent?.includes('投屏'))?.click()`)
await new Promise(resolve => setTimeout(resolve, 400))
const before = await evaluate(`document.body.innerText`)
if (!before.includes('低延迟内嵌投屏')) throw new Error('Embedded scrcpy page was not rendered')
await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent?.includes('开始投屏'))?.click()`)

let result
for (let attempt = 0; attempt < 20; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 500))
  result = await evaluate(`(() => {
    const canvas = document.querySelector('canvas')
    const status = [...document.querySelectorAll('span')].find(item => item.textContent?.includes('内嵌 ·'))?.textContent?.trim()
    return {
      status,
      width: canvas?.width || 0,
      height: canvas?.height || 0,
      error: document.body.innerText.includes('内嵌投屏启动失败'),
      body: document.body.innerText.slice(-500)
    }
  })()`)
  if ((result.status && !result.status.includes('0×0') && !result.status.endsWith('0 FPS')) || result.error) break
}
console.log(JSON.stringify(result, null, 2))
if (!result?.status || result.status.includes('0×0') || result.status.endsWith('0 FPS') || result.error) process.exitCode = 1
await evaluate(`window.electronAPI.sendScrcpyControl({
  type: 'touch', action: 'move', x: 10, y: 10,
  width: document.querySelector('canvas').width,
  height: document.querySelector('canvas').height
}).then(() => true)`)
await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent?.includes('停止投屏'))?.click()`)
socket.close()
