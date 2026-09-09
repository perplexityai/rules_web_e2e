import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn, type ChildProcess} from 'node:child_process'
import {baselineDestination, updateBaselines} from './baselines.js'
import {stageRunfiles, testEnvironment} from './isolation.js'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function main() {
  const update = process.argv.includes('--update')
  if (process.argv.slice(2).some(arg => arg !== '--update'))
    throw new Error(
      'Filtered updates are unsupported: run the full target to preserve all baselines'
    )
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
  const inputs = path.join(temp, 'inputs')
  const runfiles = process.env.RUNFILES_DIR || required('JS_BINARY__RUNFILES')
  stageRunfiles(
    process.env.RUNFILES_MANIFEST_FILE || path.join(runfiles, 'MANIFEST'),
    inputs
  )
  const input = (name: string) => path.join(inputs, required(name))
  const node = fs.realpathSync(required('JS_BINARY__NODE_BINARY'))
  const config = input('VRT_CONFIG')
  const core = input('VRT_PLAYWRIGHT_CORE')
  const coreVersion = JSON.parse(
    fs.readFileSync(path.join(core, 'package.json'), 'utf8')
  ).version
  if (coreVersion !== required('VRT_PLAYWRIGHT_VERSION'))
    throw new Error(
      `playwright-core ${coreVersion} does not match configured browser version ${process.env.VRT_PLAYWRIGHT_VERSION}`
    )
  const baselineInputs = path.join(
    inputs,
    required('VRT_CONFIG').split('/')[0],
    required('VRT_BASELINE_RELATIVE')
  )
  const baselines = path.join(temp, 'baselines')
  fs.mkdirSync(baselines)
  if (!update && fs.existsSync(baselineInputs))
    fs.cpSync(baselineInputs, baselines, {recursive: true})
  const env = {
    ...testEnvironment(
      process.env,
      JSON.parse(required('VRT_ENV_NAMES')) as string[],
      temp
    ),
    VRT_NETWORK_ORIGINS: required('VRT_NETWORK_ORIGINS'),
    VRT_INPUTS: inputs,
    ...(process.env.VRT_CUSTOM_SERVER
      ? {VRT_CUSTOM_SERVER: input('VRT_CUSTOM_SERVER')}
      : {
          VRT_VITE: input('VRT_VITE'),
          VRT_SERVER_CONFIG: input('VRT_SERVER_CONFIG'),
        }),
    VRT_UPDATE: update ? '1' : '0',
    VRT_BASELINES: baselines,
    VRT_OUTPUTS: outputs,
    VRT_CACHE: path.join(temp, 'vite-cache'),
  }
  // Docker discovery is deliberately separate from the fixture environment.
  // Set before importing Testcontainers, which reads helper settings at import time.
  for (const key of Object.keys(process.env))
    if (key.startsWith('TESTCONTAINERS_') || key.startsWith('RYUK_'))
      delete process.env[key]
  process.env.RYUK_CONTAINER_IMAGE =
    'testcontainers/ryuk:0.14.0@sha256:f0456560ea5b4acdbed0da0efc33b5f9dd6bc1e59f2337106826dcb5b0b0e981'
  const {startBrowser} = await import('./container.js')
  let browser: Awaited<ReturnType<typeof startBrowser>> | undefined
  const children: ChildProcess[] = []
  let succeeded = false
  const killChildren = () => {
    for (const child of children)
      if (child.pid && child.exitCode === null) {
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch {}
        const pid = child.pid
        setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            try {
              process.kill(-pid, 'SIGKILL')
            } catch {}
          }
        }, 3000).unref()
      }
  }
  let interrupted = false
  const onSignal = () => {
    interrupted = true
    killChildren()
  }
  process.once('SIGTERM', onSignal)
  process.once('SIGINT', onSignal)
  try {
    const server = spawn(
      node,
      [fileURLToPath(new URL('./server.js', import.meta.url))],
      {
        cwd: path.dirname(config),
        env,
        detached: true,
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      }
    )
    children.push(server)
    const appUrl = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Fixture server startup timed out')),
        30_000
      )
      server.once('error', error => {
        clearTimeout(timer)
        reject(error)
      })
      server.once('exit', code => {
        clearTimeout(timer)
        reject(new Error(`Fixture server exited: ${code}`))
      })
      server.once('message', (message: {url: string}) => {
        clearTimeout(timer)
        resolve(message.url)
      })
    })
    browser = await startBrowser(required('VRT_IMAGE'), core)
    if (interrupted) throw new Error('VRT interrupted')
    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(
        node,
        [
          path.join(input('VRT_PLAYWRIGHT_TEST'), 'cli.js'),
          'test',
          '--config',
          config,
        ],
        {
          cwd: path.dirname(config),
          stdio: 'inherit',
          detached: true,
          env: {
            ...env,
            VRT_APP_URL: appUrl,
            VRT_WS_ENDPOINT: browser!.endpoint,
          },
        }
      )
      children.push(child)
      const timer = setTimeout(
        () => {
          console.error('VRT exceeded its execution timeout')
          killChildren()
        },
        Number(required('VRT_TIMEOUT_MS'))
      )
      child.once('error', error => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', code => {
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
    killChildren()
    await Promise.all(
      children.map(
        child =>
          new Promise<void>(resolve => {
            if (child.exitCode !== null || child.signalCode !== null) {
              resolve()
              return
            }
            const timer = setTimeout(() => {
              if (child.pid) {
                try {
                  process.kill(-child.pid, 'SIGKILL')
                } catch {}
              }
              resolve()
            }, 3000)
            child.once('exit', () => {
              clearTimeout(timer)
              resolve()
            })
          })
      )
    )
    await browser?.stop()
    if (interrupted) process.exitCode = 143
    if (succeeded) fs.rmSync(temp, {recursive: true, force: true})
    process.removeListener('SIGTERM', onSignal)
    process.removeListener('SIGINT', onSignal)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
