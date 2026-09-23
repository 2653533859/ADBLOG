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
      if (args.includes('ps')) return 'PID NAME\n42 com.example.app\n43 com.example.app:worker\n44 com.other.app\n42 com.example.app'
      if (installFailure) throw new Error('INSTALL_FAILED_VERSION_DOWNGRADE')
      return 'Performing Streamed Install\nSuccess'
    }}},
    'node:fs/promises': {stat: async () => ({isFile: () => true})},
    'node:path': require('node:path')
  })
  const apps = new AppService()
  assert.deepEqual(Array.from(await apps.getAppPids('A','com.example.app')),[42,43])
  assert.equal(await apps.getAppPid('A','com.example.app'),42)
  assert.equal((await apps.installApk('A','C:/tmp/not-an-apk.zip')).success,false)
  assert.equal(installCalls.length,2)
  const installed = await apps.installApk('A','C:/tmp/My App.apk')
  assert.equal(installed.success,true)
  assert.deepEqual(Array.from(installCalls[2].args),['-s','A','install','-r','-t','C:/tmp/My App.apk'])
  assert.equal(installCalls[2].timeout,5 * 60 * 1000)
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

  const filterUtil = load('src/utils/logcat-filter.ts')
  const sampleEntries = [
    {pid:20,level:'I',tag:'Network',message:'Request failed'},
    {pid:20,level:'D',tag:'chatty',message:'Request retry'},
    {pid:30,level:'E',tag:'Network',message:'Request failed'}
  ]
  const filterOptions = {targetPids:[20],pid:null,minLevel:'I',keyword:'request',isRegex:false,
    isCaseSensitive:false,tag:'net',excludeTags:['chatty']}
  let filterResult = filterUtil.filterLogcatEntries(sampleEntries,filterOptions)
  assert.equal(filterResult.scopeCount,2)
  assert.deepEqual(Array.from(filterResult.entries, entry => entry.pid),[20])
  filterResult = filterUtil.filterLogcatEntries(sampleEntries,{...filterOptions,keyword:'[',isRegex:true})
  assert.equal(filterResult.entries.length,0)
  filterResult = filterUtil.filterLogcatEntries(sampleEntries,{...filterOptions,pid:30})
  assert.equal(filterResult.scopeCount,2)
  assert.equal(filterResult.entries.length,0)
  console.log('PASS shared logcat scope counts, advanced filters and invalid regex')

  const streams = []
  let restartCollector
  const { LogcatService } = load('electron/services/logcat-service.ts', {
    fs: {createWriteStream: () => { const s = new EventEmitter(); s.end = () => {}; streams.push(s); return s }},
    './adb-service': {adbService:terminalAdb},
    '../../src/utils/logcat-filter': filterUtil
  }, {setTimeout: fn => {restartCollector = fn; return 99}, clearTimeout: () => {}})
  const logs = new LogcatService(); logs.start('A',win)
  assert.deepEqual(Array.from(children.at(-1).args),['-s','A','logcat','-v','threadtime','-T','1'])
  const lastLine = '09-22 10:00:00.001    20    21 I Second: visible\n'
  children.at(-1).c.stdout.emit('data',Buffer.from(`09-22 10:00:00.000    10    11 I First: hidden\n${lastLine}`))
  assert.deepEqual(Array.from(logs.getBufferedLogs({targetPids:[20],pid:null,minLevel:'V',keyword:'',isRegex:false,isCaseSensitive:false,tag:'',excludeTags:[]})).map(item => item.pid),[20])
  children.at(-1).c.stdout.emit('data',Buffer.from('09-22 10:00:00.002    20    21 I Broken: partial'))
  const oldCollector = children.at(-1).c
  children.at(-1).c.emit('exit')
  assert.equal(typeof restartCollector,'function')
  restartCollector()
  assert.equal(children.at(-1).args[2],'logcat')
  oldCollector.stdout.emit('data',Buffer.from(' line\n'))
  children.at(-1).c.stdout.emit('data',Buffer.from(`${lastLine}09-22 10:00:00.003    20    21 I Third: after restart\n`))
  assert.deepEqual(Array.from(logs.getBufferedLogs(), entry => entry.message),['hidden','visible','after restart'])
  let resolved = false
  const pending = logs.startRecording('test.log').then(ok => {resolved = true; return ok})
  await Promise.resolve(); assert.equal(resolved,false)
  streams[0].emit('error',Error('permission denied')); assert.equal(await pending,false)
  const opened = logs.startRecording('test.log'); streams[1].emit('open'); assert.equal(await opened,true)
  streams[1].emit('error',Error('disk full')); assert.equal(logs.isRecording,false)
  logs.stop()
  console.log('PASS logcat restart deduplicates replay, drops stale output and recording failures')

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

  let scrcpyInit, pushed = false, closed = false, startFactory = () => Promise.resolve(mockClient)
  const scrcpyTimers = []
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
        static start = () => startFactory()
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
  }, {
    setTimeout: fn => {scrcpyTimers.push(fn); return scrcpyTimers.length},
    clearTimeout: () => {}
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

  let releaseLateClient, lateClosed = false, timedOutStarts = 0
  startFactory = () => {timedOutStarts += 1; return new Promise(resolve => {releaseLateClient = resolve})}
  const timeoutScrcpy = new ScrcpyService()
  const priorScrcpyTimers = scrcpyTimers.length
  const timeoutResult = timeoutScrcpy.startStream('device:5555',{maxSize:1280,maxFps:30,bitRate:6000000,stayAwake:true,turnScreenOff:false},win)
  for (let i = 0; i < 10 && scrcpyTimers.length === priorScrcpyTimers; i++) await new Promise(setImmediate)
  assert.equal(scrcpyTimers.length,priorScrcpyTimers + 1)
  const startupTimer = scrcpyTimers.at(-1)
  assert.equal(typeof startupTimer,'function')
  startupTimer()
  assert.equal((await timeoutResult).success,false)
  assert.equal(timedOutStarts,1)
  releaseLateClient({close: async () => {lateClosed = true}})
  await new Promise(setImmediate)
  assert.equal(lateClosed,true)
  console.log('PASS timed-out scrcpy startup closes late client without an overlapping retry')

  const {createPinia,setActivePinia} = require('pinia')
  setActivePinia(createPinia())
  let releaseLogcatStop, releaseFirstLogcatStart
  let logcatStarts = 0
  let logcatStops = 0
  const logcatListeners = new Set()
  const startupEntry = {pid:42,tid:42,level:'I',tag:'Startup',message:'first batch'}
  const logcatApi = {
    stopLogcat: () => {
      logcatStops += 1
      if (logcatStops === 1) return new Promise(resolve => {releaseLogcatStop = resolve})
      return Promise.resolve()
    },
    startLogcat: serial => {
      logcatStarts += 1
      for (const listener of logcatListeners) listener([{...startupEntry,message:serial}])
      if (serial === 'A') return new Promise(resolve => {releaseFirstLogcatStart = resolve})
      return Promise.resolve()
    },
    onRecordingError: () => () => {},
    onLogcatBatch: listener => {logcatListeners.add(listener); return () => logcatListeners.delete(listener)}
  }
  const {useLogcatStore} = load('src/stores/logcat.ts',{'../utils/logcat-filter':filterUtil}, {
    window:{electronAPI:logcatApi}, setInterval: () => 1, clearInterval: () => {}
  })
  const logcatStore = useLogcatStore()
  const startingLogcat = logcatStore.startStream('A')
  await Promise.resolve()
  assert.equal(logcatStarts,0)
  releaseLogcatStop()
  await new Promise(setImmediate)
  assert.equal(logcatStore.entries[0].message,'A')
  const switchingLogcat = logcatStore.startStream('B')
  assert.equal(logcatListeners.size,0)
  assert.equal(logcatStarts,1)
  releaseFirstLogcatStart()
  await startingLogcat
  await switchingLogcat
  assert.equal(logcatStarts,2)
  assert.equal(logcatListeners.size,1)
  assert.deepEqual(Array.from(logcatStore.entries, entry => entry.message),['B'])
  logcatStore.setTargetPids([])
  logcatStore.retainTargetPids([42])
  logcatStore.entries.push({...startupEntry,pid:77,message:'after restart'})
  logcatStore.retainTargetPids([77])
  logcatStore.retainTargetPids([])
  assert.deepEqual(Array.from(logcatStore.filteredEntries, entry => entry.message),['B','after restart'])
  logcatStore.setTargetPids([])
  assert.equal(logcatStore.filteredEntries.length,0)
  await logcatStore.stopStream()
  assert.equal(logcatListeners.size,0)
  console.log('PASS logcat startup, device changes and app PID history')

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
  assert.equal(typeof exposedApi.getAppPids,'function')
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
