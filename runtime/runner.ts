import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {validatePlaywrightVersions} from './versions.js'
import {spawn, type ChildProcess} from 'node:child_process'
import {remoteAppUrl, networkTargets} from './network.js'
import {testArguments} from './arguments.js'
import {baselineDestination, updateBaselines} from './baselines.js'
import {stageRunfiles, testEnvironment} from './isolation.js'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function main() {
  const visual = required('VRT_MODE') === 'visual'
  const remote = remoteAppUrl(process.env)
  // Validate explicit tunnel destinations before allocating resources.
  networkTargets(
    remote || 'http://127.0.0.1',
    JSON.parse(required('VRT_NETWORK_ORIGINS')) as string[]
  )
  const args = process.argv.slice(2)
  const update = args.includes('--update')
  if (!visual && update) throw new Error('E2E tests do not update baselines')
  const selectors = testArguments(visual, args)
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
  const input = (relative: string) => path.join(inputs, relative)
  const descriptorPath = input(required('VRT_DESCRIPTOR'))
  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8')) as {
    tests: string[]
    config: string | null
    matching: string | null
    server: string | null
    shell: {directory: string; entryPoint: string} | null
    playwright: {test: string; core: string; version: string; image: string}
  }
  const node = fs.realpathSync(required('JS_BINARY__NODE_BINARY'))
  const testRoot = path.dirname(descriptorPath)
  const generated = path.join(testRoot, '.rules-browser')
  fs.mkdirSync(generated)
  fs.writeFileSync(path.join(generated, 'package.json'), '{"type":"module"}')
  for (const name of [
    'suite-config',
    'config',
    'network',
    'matching',
    'visuals',
  ])
    fs.copyFileSync(
      fileURLToPath(new URL(`./${name}.js`, import.meta.url)),
      path.join(generated, `${name}.js`)
    )
  const config = path.join(generated, 'suite-config.js')
  const packageVersion = (directory: string) =>
    JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
      .version as string
  const core = input(descriptor.playwright.core)
  const testPackage = input(descriptor.playwright.test)
  validatePlaywrightVersions(
    descriptor.playwright.version,
    packageVersion(testPackage),
    packageVersion(core)
  )
  // The consumer and rules repository may stage separate copies of the same package.
  // Playwright requires one test-harness instance, even when both versions match.
  for (const module of [
    ...descriptor.tests,
    ...(descriptor.config ? [descriptor.config] : []),
  ]) {
    const consumerRequire = createRequire(pathToFileURL(input(module)))
    const directory = path.dirname(
      consumerRequire.resolve('@playwright/test/package.json')
    )
    validatePlaywrightVersions(
      descriptor.playwright.version,
      packageVersion(directory),
      packageVersion(core)
    )
    if (fs.realpathSync(directory) !== fs.realpathSync(testPackage)) {
      if (!directory.startsWith(inputs + path.sep))
        throw new Error('Playwright package escaped staged inputs')
      fs.rmSync(directory, {recursive: true})
      fs.symlinkSync(testPackage, directory)
    }
  }
  fs.mkdirSync(path.join(generated, 'node_modules', '@playwright'), {
    recursive: true,
  })
  fs.symlinkSync(
    testPackage,
    path.join(generated, 'node_modules', '@playwright', 'test')
  )
  if (visual)
    fs.copyFileSync(
      fileURLToPath(new URL('./capture.js', import.meta.url)),
      path.join(generated, '.rules-visual.spec.js')
    )
  const baselineInputs = visual
    ? path.join(
        inputs,
        required('VRT_DESCRIPTOR').split('/')[0],
        required('VRT_BASELINE_RELATIVE')
      )
    : undefined
  const baselines = path.join(temp, 'baselines')
  fs.mkdirSync(baselines)
  if (!update && baselineInputs && fs.existsSync(baselineInputs))
    fs.cpSync(baselineInputs, baselines, {recursive: true})
  const env = {
    ...testEnvironment(
      process.env,
      JSON.parse(required('VRT_ENV_NAMES')) as string[],
      temp
    ),
    VRT_NETWORK_ORIGINS: required('VRT_NETWORK_ORIGINS'),
    VRT_INPUTS: inputs,
    VRT_MODE: required('VRT_MODE'),
    VRT_TEST_ROOT: visual ? testRoot : inputs,
    VRT_TEST_FILES: JSON.stringify(descriptor.tests.map(input)),
    ...(descriptor.config
      ? {VRT_CONFIG_OVERRIDE: input(descriptor.config)}
      : {}),
    ...(descriptor.matching ? {VRT_MATCHING: input(descriptor.matching)} : {}),
    ...(descriptor.server ? {VRT_CUSTOM_SERVER: input(descriptor.server)} : {}),
    ...(descriptor.shell
      ? {
          VRT_SHELL: input(descriptor.shell.directory),
          VRT_SHELL_ENTRY: descriptor.shell.entryPoint,
        }
      : {}),
    VRT_UPDATE: update ? '1' : '0',
    VRT_BASELINES: baselines,
    VRT_OUTPUTS: outputs,
    VRT_VISUAL_CATALOG: path.join(temp, 'visual-catalog.json'),
    VRT_CACHE: path.join(temp, 'server-cache'),
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
    let appUrl = remote
    if (!appUrl) {
      const server = spawn(
        node,
        [fileURLToPath(new URL('./server.js', import.meta.url))],
        {
          cwd: testRoot,
          env,
          detached: true,
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        }
      )
      children.push(server)
      appUrl = await new Promise<string>((resolve, reject) => {
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
    }
    browser = await startBrowser(descriptor.playwright.image, core)
    if (interrupted) throw new Error('VRT interrupted')
    const run = (discover: boolean) =>
      new Promise<number>((resolve, reject) => {
        const child = spawn(
          node,
          [
            path.join(testPackage, 'cli.js'),
            'test',
            '--config',
            config,
            ...selectors,
          ],
          {
            cwd: testRoot,
            stdio: 'inherit',
            detached: true,
            env: {
              ...env,
              VRT_DISCOVER: discover ? '1' : '0',
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
    const discoveryCode = visual ? await run(true) : 0
    const code = discoveryCode === 0 ? await run(false) : discoveryCode
    if (code !== 0) {
      if (visual)
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
