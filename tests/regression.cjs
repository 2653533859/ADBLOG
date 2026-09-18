const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { EventEmitter } = require('node:events')
function load(file, mocks = {}, globals = {}) {
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext } }).outputText
  vm.runInNewContext(js, { exports, require: name => mocks[name] || require(name), process, console, Buffer, Promise, setInterval, clearInterval, ...globals })
  return exports
}
async function main() {
  const calls = []
  const { AdbService, quoteRemoteArgument } = load('electron/services/adb-service.ts', {
    child_process: { execFile: (file, args, options, cb) => { calls.push({file,args,options}); cb(null, 'ok', '') } }
  })
  const adb = new AdbService()
  await adb.exec(['-s','A','shell','input','text',"hello&whoami ' $HOME; x"])
  assert.deepEqual(Array.from(calls[0].args), ['-s','A','shell', `'input' 'text' ${quoteRemoteArgument("hello&whoami ' $HOME; x")}`])
  assert.equal(calls[0].options.shell, undefined)
  await adb.exec(['-s','A','push','C:/My Photos/a.txt','/sdcard/My Photos/a.txt'])
  assert.equal(calls[1].args[3], 'C:/My Photos/a.txt')
  const { FileService } = load('electron/services/file-service.ts', {'./adb-service': {adbService: adb}})
  await new FileService().deleteFile('A', "/sdcard/My Photos/'quoted';$HOME")
  assert.equal(calls[2].args[3], `'rm' '-rf' '--' ${quoteRemoteArgument("/sdcard/My Photos/'quoted';$HOME")}`)
  console.log('PASS host argv and remote file/text quoting')

  let discoveryDeviceReads = 0
  const discoveryDisconnects = []
  const discoveryAdb = {
    getDevices: async () => {
      discoveryDeviceReads += 1
      return discoveryDeviceReads === 1
        ? [{serial:'10.0.0.7:5555',status:'online',model:'trusted'}]
        : [
            {serial:'10.0.0.7:5555',status:'online',model:'trusted'},
            {serial:'10.0.0.8:5555',status:'unauthorized',model:'locked'}
          ]
    },
    connect: async () => ({success:true,message:'connected'}),
    disconnect: async serial => { discoveryDisconnects.push(serial); return {success:true,message:'disconnected'} }
  }
  const { DiscoveryService } = load('electron/services/discovery-service.ts', {
    net: {}, os: {}, './adb-service': {adbService:discoveryAdb}
  })
  const discovery = new DiscoveryService()
  discovery.probePort = async ip => /\.(7|8|9)$/.test(ip)
  discovery.probeAdb = async ip => !ip.endsWith('.9')
  const discovered = await discovery.scanLan(5555,'10.0.0')
  assert.equal(discovered.length,1)
  assert.equal(discovered[0].ip,'10.0.0.7')
  assert.equal(discovered[0].status,'online')
  assert.deepEqual(discoveryDisconnects,['10.0.0.8:5555'])
  console.log('PASS LAN scan rejects non-ADB and unauthorized endpoints')

  const installCalls = []
  let installFailure = false
  const { AppService } = load('electron/services/app-service.ts', {
    './adb-service': {adbService: {exec: async (args, timeout) => {
      installCalls.push({args,timeout})
      if (installFailure) throw new Error('INSTALL_FAILED_VERSION_DOWNGRADE')
      return 'Performing Streamed Install\nSuccess'
    }}},
    'node:fs/promises': {stat: async () => ({isFile: () => true})},
    'node:path': require('node:path')
  })
  const apps = new AppService()
  assert.equal((await apps.installApk('A','C:/tmp/not-an-apk.zip')).success,false)
  assert.equal(installCalls.length,0)
  const installed = await apps.installApk('A','C:/tmp/My App.apk')
  assert.equal(installed.success,true)
  assert.deepEqual(Array.from(installCalls[0].args),['-s','A','install','-r','-t','C:/tmp/My App.apk'])
  assert.equal(installCalls[0].timeout,5 * 60 * 1000)
  installFailure = true
  const failedInstall = await apps.installApk('A','C:/tmp/My App.apk')
  assert.equal(failedInstall.success,false)
  assert.match(failedInstall.message,/VERSION_DOWNGRADE/)
  console.log('PASS APK install validates files, preserves argv and reports ADB failures')

  const children = [], execCalls = []
  const terminalAdb = { spawn(args) { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.stdin = { writable: true, write: () => { throw Error('resize injected input') } }; c.kill = () => {}; children.push({c,args}); return c }, exec: async args => execCalls.push(args) }
  const terminalSent = []
  const win = {isDestroyed: () => false, webContents: {send: (channel,data) => terminalSent.push({channel,data})}}
  const { TerminalService } = load('electron/services/terminal-service.ts', {'./adb-service': {adbService:terminalAdb}})
  const terminal = new TerminalService()
  terminal.createSession('one','A',win); terminal.createSession('one','A',win)
  assert.equal(children.length,1); assert.ok(children[0].args.includes('-tt'))
  terminal.resize('one',120,40)
  children[0].c.stdout.emit('data',Buffer.from('__ADBLOG_TTY__/dev/pts/2\r\r\nrk3588:/ $ '))
  assert.equal(execCalls[0].at(-1),'40')
  terminal.createSession('one','A',win)
  assert.equal(terminalSent.filter(item => item.data === 'rk3588:/ $ ').length,2)
  terminal.createSession('one','B',win)
  assert.equal(children.length,2)
  console.log('PASS terminal CRCRLF parsing, replay, device switch and resize isolation')

  const streams = []
  const { LogcatService } = load('electron/services/logcat-service.ts', {
    fs: {createWriteStream: () => { const s = new EventEmitter(); s.end = () => {}; streams.push(s); return s }},
    './adb-service': {adbService:terminalAdb}
  })
  const logs = new LogcatService(); logs.start('A',win)
  let resolved = false
  const pending = logs.startRecording('test.log').then(ok => {resolved = true; return ok})
  await Promise.resolve(); assert.equal(resolved,false)
  streams[0].emit('error',Error('permission denied')); assert.equal(await pending,false)
  const opened = logs.startRecording('test.log'); streams[1].emit('open'); assert.equal(await opened,true)
  streams[1].emit('error',Error('disk full')); assert.equal(logs.isRecording,false)
  logs.stop()
  console.log('PASS recording open and asynchronous failure handling')

  const timers = [], sent = [], collectors = []
  const { PerfService } = load('electron/services/perf-service.ts', {'./adb-service': {adbService: {}}}, {
    setInterval: fn => { timers.push(fn); return timers.length }, clearInterval: () => {}
  })
  const perf = new PerfService()
  perf.collectSample = () => new Promise(resolve => collectors.push(resolve))
  const perfWindow = {isDestroyed: () => false, webContents: {send: (_, data) => sent.push(data)}}
  perf.start('A','old',perfWindow)
  const oldTick = timers[0]()
  perf.start('B','new',perfWindow)
  collectors[0]({timestamp:1}); await oldTick
  assert.equal(sent.length,0)
  const newTick = timers[1](); collectors[1]({timestamp:2}); await newTick
  assert.equal(sent[0].timestamp,2)
  perf.stop()
  console.log('PASS monitoring restart rejects stale samples')

  let scrcpyInit, pushed = false, closed = false
  const mockClient = {
    videoStream: Promise.resolve({
      metadata: {codec: 1748121140, width: 720, height: 1280},
      width: 720, height: 1280,
      sizeChanged: () => {},
      stream: {getReader: () => ({read: () => new Promise(() => {}), releaseLock: () => {}})}
    }),
    controller: {setScreenPowerMode: async () => {}, injectTouch: async () => {}},
    exited: new Promise(() => {}),
    close: async () => {closed = true}
  }
  const { ScrcpyService } = load('electron/services/scrcpy-service.ts', {
    electron: {app: {getAppPath: () => process.cwd()}},
    'node:fs/promises': {readFile: async () => Buffer.from('server')},
    'node:fs': {existsSync: () => true},
    'node:path': require('node:path'),
    fs: {existsSync: () => true},
    '@yume-chan/adb': {AdbServerClient: class {createAdb = async selector => ({selector})}},
    '@yume-chan/adb-server-node-tcp': {AdbServerNodeTcpConnector: class {}},
    '@yume-chan/adb-scrcpy': {
      AdbScrcpyOptionsLatest: class {constructor(init) {scrcpyInit = init}},
      AdbScrcpyClient: class {
        static pushServer = async () => {pushed = true}
        static start = async () => mockClient
      }
    },
    '@yume-chan/stream-extra': {PushReadableStream: class {}},
    '@yume-chan/scrcpy': {
      AndroidKeyCode: {AndroidHome:3,AndroidBack:4,AndroidAppSwitch:187,Power:26},
      AndroidKeyEventAction: {Down:0,Up:1},
      AndroidMotionEventAction: {Down:0,Up:1,Move:2},
      AndroidMotionEventButton: {None:0,Primary:1},
      ScrcpyPointerId: {Finger:-2n}
    },
    './adb-service': {adbService:{adbPath:'mock-adb'}}
  })
  const scrcpy = new ScrcpyService()
  const result = await scrcpy.startStream('device:5555',{maxSize:1280,maxFps:30,bitRate:6000000,stayAwake:true,turnScreenOff:false},win)
  assert.equal(result.success,true); assert.equal(pushed,true)
  assert.equal(scrcpyInit.maxSize,1280); assert.equal(scrcpyInit.maxFps,30)
  assert.equal(scrcpyInit.videoBitRate,6000000); assert.equal(scrcpyInit.videoCodec,'h264')
  await scrcpy.stopStream(); assert.equal(closed,true)
  closed = false
  mockClient.videoStream = Promise.reject(new Error('bad video metadata'))
  const failedScrcpy = new ScrcpyService()
  const failedResult = await failedScrcpy.startStream('device:5555',{maxSize:1280,maxFps:30,bitRate:6000000,stayAwake:true,turnScreenOff:false},win)
  assert.equal(failedResult.success,false); assert.equal(closed,true)
  console.log('PASS embedded scrcpy options, lifecycle and failed-start cleanup')

  const {createPinia,setActivePinia} = require('pinia')
  setActivePinia(createPinia())
  let callback, written
  const api = {startPerf: () => {},stopPerf: () => {},onPerfSample: fn => {callback=fn;return () => {}},
    showSaveDialog: async () => 'chosen/report.csv',writeTextFile: async (path,content) => {written={path,content}}}
  const {usePerfStore} = load('src/stores/perf.ts',{}, {window:{electronAPI:api}})
  const store = usePerfStore();store.startMonitoring('A',null)
  for(let i=0;i<65;i++) callback({timestamp:i,cpu:{appPercent:i,systemPercent:0},memory:{},network:{},battery:{}})
  assert.equal(store.history.length,60);assert.equal(store.currentSample.timestamp,64)
  await store.exportCsv();assert.equal(written.path,'chosen/report.csv');assert.equal(written.content.split('\n').length,61)
  store.stopMonitoring()
  console.log('PASS capped history continues sampling and CSV uses chosen destination')

  const preload = fs.readFileSync('dist-electron/preload.cjs','utf8')
  let exposedApi
  vm.runInNewContext(preload, {require: name => {assert.equal(name,'electron'); return {
    contextBridge:{exposeInMainWorld: (_,value) => {exposedApi=value}},ipcRenderer:{},
    webUtils:{getPathForFile: file => file.mockPath}
  }},exports:{}})
  assert.equal(typeof exposedApi.startLogcat,'function')
  assert.equal(typeof exposedApi.installApk,'function')
  assert.equal(typeof exposedApi.showOpenDialogApk,'function')
  assert.equal(exposedApi.getPathForFile({mockPath:'C:/tmp/app.apk'}),'C:/tmp/app.apk')
  console.log('PASS built preload executes with sandbox-style CommonJS loader')

  if (process.argv.includes('--device')) {
    const real = load('electron/services/adb-service.ts').adbService
    const devices = await real.getDevices(); const serial = devices.find(d => d.status === 'online')?.serial
    assert.ok(serial,'No device connected')
    const literal = "hello&whoami /sdcard/My Photos/'quoted' $HOME; echo bad"
    const out = await real.exec(['-s',serial,'shell','printf','%s',literal])
    assert.equal(out,literal)
    const tty = await new Promise((resolve,reject) => {const c=real.spawn(['-s',serial,'shell','-tt','tty']);let out='';c.stdout.on('data',b=>out+=b);c.on('error',reject);c.on('close',()=>resolve(out))})
    assert.match(tty,/\/dev\/pts\/\d+/)
    console.log('PASS real Android literal arguments and remote PTY (read-only)')
  }
}
main().catch(e => {console.error(e);process.exitCode=1})
