import fs from 'node:fs'
import {forwardOutput} from './output.js'
import {manageChild} from './child-process.js'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {validatePlaywrightVersions, validateChromiumVersion} from './versions.js'
import {spawn, execFileSync} from 'node:child_process'
import {remoteAppUrl} from './network.js'
import {testArguments} from './arguments.js'
import {applyBaselineUpdate, baselineDestination, baselineHashes, materializeSnapshots, updateBaselines} from './baselines.js'
import {browserTempRoot, removeScratch, testEnvironment} from './isolation.js'
import {hostBrowserEnvironment} from './host-browser.js'
import {browserRuntime, type BrowserRuntime} from './browser-runtime.js'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function main() {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(browserTempRoot(fs.realpathSync(process.env.TEST_TMPDIR || os.tmpdir())), 'vrt-')))
  try {
    await run(temp)
  } finally {
    removeScratch(temp)
  }
}

async function run(temp: string) {
  const processOwned = required('VRT_MODE') === 'process'
  const gallery = required('VRT_MODE') === 'visual'
  const visual = gallery || required('VRT_MODE') === 'visual-spec'
  const remote = remoteAppUrl(process.env)
  const args = process.argv.slice(2)
  const update = args.includes('--update')
  const exportSnapshots = !visual && args.includes('--export-snapshots')
  const snapshotRelative = process.env.VRT_SNAPSHOT_RELATIVE || ''
  const snapshotCapture = process.env.VRT_SNAPSHOT_CAPTURE_OUTPUT
    ? path.resolve(required('JS_BINARY__EXECROOT'), process.env.VRT_SNAPSHOT_CAPTURE_OUTPUT) : undefined
  if (!visual && update) throw new Error('E2E tests do not update baselines')
  const captureOutput = update ? process.env.VRT_CAPTURE_OUTPUT : undefined
  const destination = update && !captureOutput
    ? baselineDestination(
        required('BUILD_WORKSPACE_DIRECTORY'),
        required('VRT_BASELINE_RELATIVE')
      )
    : undefined
  const baselineBefore = destination ? baselineHashes(destination) : undefined
  const outputs =
    (snapshotCapture ? path.join(snapshotCapture, 'artifacts') : process.env.TEST_UNDECLARED_OUTPUTS_DIR) || fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-artifacts-'))
  fs.mkdirSync(outputs, {recursive: true})
  const inputs = process.env.RUNFILES_DIR || required('JS_BINARY__RUNFILES')
  const input = (relative: string) => path.join(inputs, relative)
  const snapshotInputs = snapshotRelative ? path.join(inputs, required('VRT_DESCRIPTOR').split('/')[0], snapshotRelative) : undefined
  if (snapshotCapture) {
    if (!exportSnapshots || !snapshotInputs) throw new Error('Snapshot capture requires export mode and snapshot_dir')
    fs.writeFileSync(path.join(snapshotCapture, 'baseline-before.json'), JSON.stringify({workspace: required('VRT_DESCRIPTOR').split('/')[0], hashes: baselineHashes(snapshotInputs, true, true)}))
  }
  const descriptorPath = input(required('VRT_DESCRIPTOR'))
  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8')) as {
    harness: string
    browserCache: string | null
    tests: string[]
    config: string | null
    matching: string | null
    server: string | null
    shell: {directory: string; entryPoint: string} | null
    browser?: BrowserRuntime | null
    playwright: {
      test: string
      core: string
      version: string
      fromConsumer: boolean
    }
  }
  const testFiles = descriptor.tests.map(name => fs.realpathSync(input(name)))
  let discoveryRoot = testFiles.length ? path.dirname(testFiles[0]) : inputs
  while (testFiles.some(file => path.relative(discoveryRoot, file).split(path.sep)[0] === '..'))
    discoveryRoot = path.dirname(discoveryRoot)
  const selectors = testArguments(visual, args, descriptor.tests)
  if (exportSnapshots)
    fs.writeFileSync(path.join(outputs, 'snapshot-sources.json'), JSON.stringify(
      Object.fromEntries(testFiles.map((file, index) => [path.relative(discoveryRoot, file), descriptor.tests[index]]))
    ))
  if (visual && !descriptor.browser) throw new Error("VRT requires a declared browser runtime")
  const declaredBrowser = descriptor.browser
    ? browserRuntime(inputs, descriptor.browser, process.env.VRT_HOST_EXECUTION === '1')
    : undefined
  const hostEnv = declaredBrowser || processOwned ? {} : hostBrowserEnvironment(process.env.PLAYWRIGHT_BROWSERS_PATH)
  const node = declaredBrowser?.node || fs.realpathSync(required('JS_BINARY__NODE_BINARY'))
  const testRoot = processOwned
    ? path.join(inputs, required('VRT_DESCRIPTOR').split('/')[0])
    : path.dirname(descriptorPath)
  const config = fs.realpathSync(path.join(input(descriptor.harness), 'suite-config.js'))
  const generated = path.dirname(config)
  const packageVersion = (directory: string) =>
    JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
      .version as string
  const modules = [...descriptor.tests, ...(descriptor.config ? [descriptor.config] : [])]
  const modulePackage = (module: string) => path.dirname(
    createRequire(pathToFileURL(fs.realpathSync(input(module))))
      .resolve('@playwright/test/package.json')
  )
  // The default uses the caller's dependency graph when a spec/config supplies
  // one. An explicit playwright_runtime remains authoritative.
  const testPackage = descriptor.playwright.fromConsumer && modules.length
    ? modulePackage(modules[0]) : fs.realpathSync(input(descriptor.playwright.test))
  const playwrightPackage = createRequire(path.join(testPackage, 'package.json'))
    .resolve('playwright/package.json')
  const resolvedCore = path.dirname(createRequire(playwrightPackage).resolve('playwright-core/package.json'))
  const core = descriptor.playwright.fromConsumer
    ? resolvedCore : fs.realpathSync(input(descriptor.playwright.core))
  validatePlaywrightVersions(
    descriptor.playwright.version,
    packageVersion(testPackage),
    packageVersion(core)
  )
  if (fs.realpathSync(resolvedCore) !== fs.realpathSync(core))
    throw new Error('playwright_runtime.core must be the playwright-core package used by its test package')
  // Playwright requires one test-harness instance. The caller owns its dependency
  // graph; validate that graph rather than replacing packages inside it.
  for (const module of modules) {
    const directory = modulePackage(module)
    validatePlaywrightVersions(
      descriptor.playwright.version,
      packageVersion(directory),
      packageVersion(core)
    )
    if (fs.realpathSync(directory) !== fs.realpathSync(testPackage))
      throw new Error(
        `Playwright package mismatch for ${module}: tests and config must resolve ` +
        'the same @playwright/test package declared by playwright_runtime; fix the caller dependencies'
      )
  }
  const baselineInputs = visual
    ? path.join(
        inputs,
        required('VRT_DESCRIPTOR').split('/')[0],
        required('VRT_BASELINE_RELATIVE')
      )
    : undefined
  if (captureOutput)
    fs.writeFileSync(
      path.join(path.dirname(captureOutput), 'baseline-before.json'),
      JSON.stringify(baselineInputs ? baselineHashes(baselineInputs, true) : {})
    )
  const baselines = path.join(temp, 'baselines')
  fs.mkdirSync(baselines)
  if (!update && baselineInputs && fs.existsSync(baselineInputs))
    materializeSnapshots(baselineInputs, baselines)
  const fixtureEnv = testEnvironment(
    process.env,
    [...JSON.parse(required('VRT_ENV_NAMES')) as string[], 'TEST_RUN_NUMBER', 'TEST_RANDOM_SEED'],
    temp
  )
  const env = {
    ...fixtureEnv,
    ...hostEnv,
    ...declaredBrowser?.env,
    ...(descriptor.browserCache ? {PLAYWRIGHT_BROWSERS_PATH: input(descriptor.browserCache)} : {}),
    ...(declaredBrowser ? {
      NODE_OPTIONS: [
        fixtureEnv.NODE_OPTIONS || '',
        `--import=${JSON.stringify(fileURLToPath(new URL('./process-shell.js', import.meta.url)))}`,
      ].filter(Boolean).join(' '),
    } : {}),
    VRT_INPUTS: inputs,
    VRT_PLAYWRIGHT_CORE: core,
    VRT_PLAYWRIGHT_PACKAGE: path.join(testPackage, 'package.json'),
    VRT_ISOLATED: declaredBrowser ? '1' : '0',
    VRT_HOST_EXECUTION: process.env.VRT_HOST_EXECUTION === '1' ? '1' : '0',
    VRT_MODE: required('VRT_MODE'),
    VRT_TEST_ROOT: gallery ? generated : discoveryRoot,
    VRT_TEST_FILES: JSON.stringify(testFiles),
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
    VRT_EXPORT_SNAPSHOTS: exportSnapshots ? '1' : '0',
    VRT_SNAPSHOT_ROOT: snapshotRelative ? path.join(inputs, required('VRT_DESCRIPTOR').split('/')[0], snapshotRelative) : '',
    VRT_BASELINES: baselines,
    VRT_OUTPUTS: outputs,
    VRT_VISUAL_CATALOG: path.join(temp, 'visual-catalog.json'),
    VRT_CACHE: path.join(temp, 'server-cache'),
    RUNFILES_DIR: inputs,
    RUNFILES: inputs,
    RUNFILES_MANIFEST_FILE: '',
    TEST_WORKSPACE: required('VRT_DESCRIPTOR').split('/')[0],
    BAZEL_WORKSPACE: required('VRT_DESCRIPTOR').split('/')[0],
    BAZEL_BINDIR: '.',
    TEST_TMPDIR: temp,
    TEST_UNDECLARED_OUTPUTS_DIR: outputs,
    PATH: `${path.dirname(node)}:/usr/bin:/bin`,
  }
  if (declaredBrowser) {
    const actual = execFileSync(declaredBrowser.env.VRT_CHROMIUM_EXECUTABLE, ['--version'], {
      env, encoding: 'utf8', timeout: 15_000,
    })
    validateChromiumVersion(JSON.parse(fs.readFileSync(path.join(core, 'browsers.json'), 'utf8')), actual)
  }
  const children: ReturnType<typeof manageChild>[] = []
  let succeeded = false
  const killChildren = () => {
    for (const child of children) child.stop()
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
    if (!appUrl && !processOwned) {
      const server = spawn(
        node,
        [
          fileURLToPath(
            new URL(
              descriptor.server || descriptor.shell
                ? './server.js'
                : './config-url.js',
              import.meta.url
            )
          ),
        ],
        {
          cwd: testRoot,
          env,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        }
      )
      if (server.stdout) forwardOutput(server.stdout, process.stdout)
      if (server.stderr) forwardOutput(server.stderr, process.stderr)
      children.push(manageChild(server))
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
            stdio: ['inherit', 'pipe', 'pipe'],
            detached: true,
            env: {
              ...env,
              VRT_DISCOVER: discover ? '1' : '0',
              VRT_APP_URL: appUrl,
            },
          }
        )
        if (child.stdout) forwardOutput(child.stdout, process.stdout)
        if (child.stderr) forwardOutput(child.stderr, process.stderr)
        const managed = manageChild(child, processOwned)
        children.push(managed)
        let timedOut = false
        const timer = setTimeout(
          () => {
            timedOut = true
            console.error('VRT exceeded its execution timeout')
            killChildren()
          },
          Number(required('VRT_TIMEOUT_MS'))
        )
        managed.closed.then(code => {
          clearTimeout(timer)
          resolve(timedOut || interrupted ? 1 : code ?? 1)
        }, error => {
          clearTimeout(timer)
          reject(error)
        })
      })
    const discoveryCode = gallery ? await run(true) : 0
    const code = discoveryCode === 0 ? await run(false) : discoveryCode
    if (code !== 0) {
      if (visual)
        materializeSnapshots(baselines, path.join(outputs, 'reference'))
      process.exitCode = code
      console.error(`VRT artifacts: ${outputs}`)
      return
    }
    if (snapshotCapture) {
      const captured = path.join(outputs, 'snapshots')
      if (!Object.keys(baselineHashes(captured, false, true)).length)
        throw new Error('Capture produced no snapshots; nothing was applied')
      const merged = path.join(snapshotCapture, 'snapshots')
      if (fs.existsSync(snapshotInputs!)) materializeSnapshots(snapshotInputs!, merged)
      materializeSnapshots(captured, merged, true)
    }
    if (destination) {
      applyBaselineUpdate(baselines, destination, baselineBefore!)
      console.log(`Updated baselines: ${destination}`)
    }
    if (captureOutput) {
      updateBaselines(baselines, captureOutput)
      console.log(`Captured baselines: ${captureOutput}`)
    }
    succeeded = true
  } finally {
    killChildren()
    await Promise.allSettled(children.map(child => child.closed))
    if (interrupted) process.exitCode = 143
    if (succeeded && !process.env.TEST_UNDECLARED_OUTPUTS_DIR && !exportSnapshots && !snapshotCapture) removeScratch(outputs)
    process.removeListener('SIGTERM', onSignal)
    process.removeListener('SIGINT', onSignal)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
