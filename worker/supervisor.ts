import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import {createHash} from 'node:crypto'
import {spawn, type ChildProcess} from 'node:child_process'
import {setTimeout as sleep} from 'node:timers/promises'

export function preflight(worker: string, expected: string) {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('This worker preset requires a Linux amd64 machine')
  if (createHash('sha256').update(fs.readFileSync(worker)).digest('hex') !== expected)
    throw new Error('actiond binary does not match the preset checksum')
  for (const device of ['/dev/kvm', '/dev/vhost-vsock']) {
    try {
      if (!fs.statSync(device).isCharacterDevice()) throw new Error('Not a character device')
      fs.accessSync(device, fs.constants.R_OK | fs.constants.W_OK)
    } catch { throw new Error(`actiond requires readable/writable ${device}; use a KVM-capable runner`) }
  }
}
export function bazelConfig(endpoint: string) {
  return ['--jobs=2', `--remote_executor=${endpoint}`, `--remote_cache=${endpoint}`,
    '--spawn_strategy=sandboxed,local', '--strategy=VrtCapture=remote', '--strategy=TestRunner=remote,local',
    '--remote_local_fallback=false', '--remote_upload_local_results=false', '--noremote_cache_compression',
    '--remote_download_outputs=all', '--extra_execution_platforms=@rules_web_e2e//internal:linux_amd64',
  ].map(flag => `build:web-e2e ${flag}\n`).join('')
}
function running(child: ChildProcess) { return child.exitCode === null && child.signalCode === null }
async function stop(child?: ChildProcess) {
  if (!child?.pid) return
  const signal = (sig: NodeJS.Signals) => {
    try { process.kill(-child.pid!, sig) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  signal('SIGTERM')
  const deadline = performance.now() + 5000
  while (running(child) && performance.now() < deadline) await sleep(25)
  signal('SIGKILL')
  while (running(child)) await sleep(10)
}
async function freePort(port: number) {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()))
  })
}
async function listening(port: number) {
  return new Promise<boolean>(resolve => {
    const socket = net.connect(port, '127.0.0.1')
    const done = (ready: boolean) => { socket.destroy(); resolve(ready) }
    socket.setTimeout(100, () => done(false))
    socket.once('error', () => done(false))
    socket.once('connect', () => done(true))
  })
}
export async function supervise(worker: string, command: (config: string) => string[], logDir: string,
  port = 8980, startupTimeout = 90, memoryMib = 6144, casImageSizeMib = 4096) {
  await freePort(port)
  fs.mkdirSync(logDir, {recursive: true})
  const logs = fs.mkdtempSync(path.resolve(logDir, 'run-'))
  const endpoint = `grpc://127.0.0.1:${port}`
  const config = path.join(logs, 'worker.bazelrc')
  fs.writeFileSync(config, bazelConfig(endpoint))
  console.error(`actiond logs: ${logs}`)
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-web-e2e-'))
  const log = fs.openSync(path.join(logs, 'actiond.log'), 'w')
  let interrupted = 0
  const interrupt = () => { interrupted ||= 130 }
  const terminate = () => { interrupted ||= 143 }
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  let workerProcess: ChildProcess | undefined, commandProcess: ChildProcess | undefined
  let spawnError: Error | undefined
  try {
    workerProcess = spawn(worker, ['serve-vm', `--root=${state}/vm`, `--listen=127.0.0.1:${port}`,
      `--memory-mib=${memoryMib}`, '--cpus=2', `--cas-image-size-mib=${casImageSizeMib}`], {
      stdio: ['ignore', log, log], detached: true, env: {PATH: '/bin:/usr/bin', HOME: state, TMPDIR: state},
    })
    workerProcess.on('error', error => { spawnError = error })
    const deadline = performance.now() + startupTimeout * 1000
    while (!interrupted) {
      if (spawnError) throw spawnError
      if (!running(workerProcess)) throw new Error(`actiond exited during startup; see ${logs}/actiond.log`)
      if (performance.now() >= deadline) throw new Error(`actiond startup timed out; see ${logs}/actiond.log`)
      if (await listening(port)) break
      await sleep(50)
    }
    if (interrupted) return interrupted
    const [binary, ...args] = command(config)
    commandProcess = spawn(binary, args, {stdio: 'inherit', detached: true,
      env: {...process.env, RULES_WEB_E2E_ENDPOINT: endpoint, RULES_WEB_E2E_BAZELRC: config}})
    commandProcess.on('error', error => { spawnError = error })
    while (running(commandProcess) && !interrupted) {
      if (spawnError) throw spawnError
      if (!running(workerProcess)) throw new Error(`actiond exited while the command was running; see ${logs}/actiond.log`)
      await sleep(50)
    }
    if (interrupted) return interrupted
    if (spawnError) throw spawnError
    if (!running(workerProcess)) throw new Error(`actiond exited while the command was running; see ${logs}/actiond.log`)
    return commandProcess.exitCode ?? 128 + os.constants.signals[commandProcess.signalCode!]
  } finally {
    await stop(commandProcess)
    await stop(workerProcess)
    fs.closeSync(log)
    fs.rmSync(state, {recursive: true, force: true})
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
  }
}
