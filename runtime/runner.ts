import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn, execFileSync, type ChildProcess} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {baselineDestination, updateBaselines} from './baselines.js'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function runfile(name: string) {
  const root = process.env.RUNFILES_DIR || process.env.JS_BINARY__RUNFILES
  if (root && fs.existsSync(path.join(root, name))) return path.join(root, name)
  if (process.env.RUNFILES_MANIFEST_FILE) {
    const entries = fs
      .readFileSync(process.env.RUNFILES_MANIFEST_FILE, 'utf8')
      .split('\n')
    for (const line of entries) {
      const space = line.indexOf(' ')
      const key = line.slice(0, space)
      if (key === name) return line.slice(space + 1)
      if (name.startsWith(`${key}/`))
        return path.join(line.slice(space + 1), name.slice(key.length + 1))
    }
  }
  throw new Error(`Missing runfile: ${name}`)
}

function docker(...args: string[]) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  }).trim()
}

async function main() {
  const update = process.argv.includes('--update')
  if (process.argv.slice(2).some(arg => arg !== '--update')) {
    throw new Error(
      'Filtered updates are unsupported: run the full target to preserve all baselines'
    )
  }
  const destination = update
    ? baselineDestination(
        required('BUILD_WORKSPACE_DIRECTORY'),
        required('VRT_BASELINE_RELATIVE')
      )
    : undefined
  const temp = fs.mkdtempSync(
    path.join(process.env.TEST_TMPDIR || os.tmpdir(), 'vrt-')
  )
  const outputs =
    process.env.TEST_UNDECLARED_OUTPUTS_DIR || path.join(temp, 'artifacts')
  fs.mkdirSync(outputs, {recursive: true})
  const configName = required('VRT_CONFIG')
  const config = runfile(configName)
  const runner = runfile(required('VRT_RUNNER'))
  const core = fs.realpathSync(runfile(required('VRT_PLAYWRIGHT_CORE')))
  const coreVersion = JSON.parse(
    fs.readFileSync(path.join(core, 'package.json'), 'utf8')
  ).version
  if (coreVersion !== required('VRT_PLAYWRIGHT_VERSION')) {
    throw new Error(
      `playwright-core ${coreVersion} does not match configured browser version ${process.env.VRT_PLAYWRIGHT_VERSION}`
    )
  }
  // Baseline inputs and config are consumer-owned runfiles, in the same repository.
  const repository = configName.split('/')[0]
  const runfilesRoot =
    process.env.RUNFILES_DIR || required('JS_BINARY__RUNFILES')
  const baselineInputs = path.join(
    runfilesRoot,
    repository,
    required('VRT_BASELINE_RELATIVE')
  )
  const baselines = path.join(temp, 'baselines')
  fs.mkdirSync(baselines)
  if (!update && fs.existsSync(baselineInputs))
    fs.cpSync(baselineInputs, baselines, {recursive: true, dereference: true})
  let succeeded = false
  let container: string | undefined
  let child: ChildProcess | undefined
  const stop = () => {
    if (container) {
      const id = container
      container = undefined
      try {
        docker('rm', '--force', id)
      } catch (error) {
        console.error(`Container cleanup failed: ${String(error)}`)
      }
    }
  }
  const killChild = () => {
    if (child?.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {}
    }
  }
  const onSignal = () => {
    killChild()
    stop()
    process.exit(143)
  }
  process.once('SIGTERM', onSignal)
  process.once('SIGINT', onSignal)
  process.once('exit', stop)
  try {
    container = docker(
      'create',
      '--init',
      '--shm-size=1g',
      '--publish',
      '127.0.0.1::3000',
      '--env',
      'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright',
      required('VRT_IMAGE'),
      'node',
      '/tmp/rules-web-e2e-playwright-core/cli.js',
      'run-server',
      '--host',
      '0.0.0.0',
      '--port',
      '3000'
    )
    const serverPackage = path.join(temp, 'playwright-core')
    fs.cpSync(core, serverPackage, {recursive: true, dereference: true})
    docker(
      'cp',
      serverPackage,
      `${container}:/tmp/rules-web-e2e-playwright-core`
    )
    docker('start', container)
    let ready = false
    for (let attempt = 0; attempt < 120; attempt++) {
      if (docker('logs', container).includes('Listening on')) {
        ready = true
        break
      }
      if (
        docker('inspect', '--format', '{{.State.Running}}', container) !==
        'true'
      )
        break
      await delay(250)
    }
    if (!ready)
      throw new Error(
        `Playwright server did not start:\n${docker('logs', container)}`
      )
    const binding = docker('port', container, '3000/tcp')
    const port = binding.slice(binding.lastIndexOf(':') + 1)
    const dockerHost = process.env.DOCKER_HOST?.startsWith('tcp:')
      ? new URL(process.env.DOCKER_HOST).hostname
      : '127.0.0.1'
    const code = await new Promise<number>((resolve, reject) => {
      child = spawn(runner, ['test', '--config', config], {
        stdio: 'inherit',
        detached: true,
        env: {
          ...process.env,
          CI: '1',
          VRT_UPDATE: update ? '1' : '0',
          VRT_SERVER: runfile(required('VRT_SERVER')),
          VRT_SERVER_CONFIG: runfile(required('VRT_SERVER_CONFIG')),
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
          VRT_WS_ENDPOINT: `ws://${dockerHost}:${port}/`,
          VRT_BASELINES: baselines,
          VRT_OUTPUTS: outputs,
          VRT_CACHE: path.join(temp, 'vite-cache'),
        },
      })
      const timer = setTimeout(
        () => {
          console.error('VRT exceeded its execution timeout')
          killChild()
        },
        Number(required('VRT_TIMEOUT_MS'))
      )
      child.on('error', error => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('exit', code => {
        clearTimeout(timer)
        resolve(code ?? 1)
      })
    })
    if (code !== 0) {
      fs.cpSync(baselines, path.join(outputs, 'reference'), {recursive: true})
      process.exitCode = code
      console.error(`VRT artifacts: ${outputs}`)
      return
    }
    if (destination) {
      updateBaselines(baselines, destination)
      console.log(`Updated baselines: ${destination}`)
    }
    succeeded = true
  } finally {
    stop()
    if (succeeded) fs.rmSync(temp, {recursive: true, force: true})
    process.removeListener('exit', stop)
    process.removeListener('SIGTERM', onSignal)
    process.removeListener('SIGINT', onSignal)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
