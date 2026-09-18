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
  const response = await command('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
  if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text)
  return response.result?.result?.value
}

await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent?.includes('终端'))?.click()`)
await new Promise(resolve => setTimeout(resolve, 900))
await evaluate(`window.electronAPI.writeTerminal('term-1', "printf '__ADBLOG_TERMINAL_OK__\\n'\\n")`)

let result
for (let attempt = 0; attempt < 12; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 250))
  result = await evaluate(`(() => {
    const terminal = document.querySelector('.xterm')
    const rowsText = terminal?.querySelector('.xterm-rows')?.textContent || ''
    return {
      terminalPresent: Boolean(terminal),
      rowsText,
      hasPrompt: rowsText.includes('rk3588:/ $'),
      hasCommandResult: rowsText.includes('__ADBLOG_TERMINAL_OK__'),
      hasFailure: rowsText.includes('Unable to create session') || rowsText.includes('Unable to start shell')
    }
  })()`)
  if (result.hasCommandResult || result.hasFailure) break
}
console.log(JSON.stringify(result, null, 2))
if (!result?.terminalPresent || !result.hasPrompt || !result.hasCommandResult || result.hasFailure) process.exitCode = 1

await command('Page.reload', { ignoreCache: true })
await new Promise(resolve => setTimeout(resolve, 1800))
await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent?.includes('终端'))?.click()`)
await new Promise(resolve => setTimeout(resolve, 900))
const replay = await evaluate(`(() => {
  const rowsText = document.querySelector('.xterm-rows')?.textContent || ''
  return {
    hasPrompt: rowsText.includes('rk3588:/ $'),
    hasCommandResult: rowsText.includes('__ADBLOG_TERMINAL_OK__')
  }
})()`)
console.log(JSON.stringify({ replay }, null, 2))
if (!replay.hasPrompt || !replay.hasCommandResult) process.exitCode = 1
socket.close()
