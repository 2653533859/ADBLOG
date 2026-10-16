import assert from 'node:assert/strict'

const port = Number(process.argv[2] || 9242)
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
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
  const value = JSON.parse(event.data)
  pending.get(value.id)?.(value)
  pending.delete(value.id)
})
async function evaluate(expression) {
  const id = ++nextId
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
  const value = await new Promise(resolve => pending.set(id, resolve))
  if (value.result?.exceptionDetails) throw new Error(value.result.exceptionDetails.text)
  return value.result?.result?.value
}
for (const [menuLabel, heading] of [
  ['多设备投屏与日志', '多设备投屏与日志'],
  ['崩溃与 ANR 事件', '异常事件中心'], ['关联时间轴', '关联时间轴'], ['一键问题采集', '一键问题采集'],
  ['多设备工作区', '多设备工作区'], ['Perfetto 系统追踪', 'Perfetto 系统追踪']
]) {
  const moreFound = await evaluate(`(() => {
    const more = [...document.querySelectorAll('aside button')].find(item => item.textContent?.trim() === '更多');
    if (more?.getAttribute('aria-expanded') === 'false') more.click();
    return Boolean(more);
  })()`)
  assert.ok(moreFound, 'More navigation should exist')
  await new Promise(resolve => setTimeout(resolve, 50))
  const found = await evaluate(`(() => {
    const button = [...document.querySelectorAll('aside button')].find(item => item.textContent?.trim() === ${JSON.stringify(menuLabel)});
    button?.click();
    return Boolean(button);
  })()`)
  assert.ok(found, `${menuLabel} navigation should exist in More`)
  const visible = await evaluate(`document.querySelector('main')?.textContent?.includes(${JSON.stringify(heading)})`)
  assert.ok(visible, `${heading} should render`)
}
socket.close()
console.log('PASS packaged Electron opens every new feature view')
