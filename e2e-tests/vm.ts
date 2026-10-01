import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {setTimeout as sleep} from 'node:timers/promises'
import {bazel, files, json, nonempty, outputFiles, run, text} from './harness.ts'

const work = path.resolve(process.argv[2])
const arch = process.env.ACTIOND_ARCH || 'x64'
assert(['x64', 'arm64'].includes(arch))
const endpoint = process.argv[3] || process.env.RULES_WEB_E2E_ENDPOINT
assert(endpoint, 'Missing actiond endpoint')
process.chdir(path.join(work, 'public'))
fs.mkdirSync(`${work}/results`, {recursive: true})
const command = [bazel, `--output_base=${work}/public-bazel-output`]
const flags = process.env.RULES_WEB_E2E_BAZELRC ? ['--config=web-e2e'] : [
  '--jobs=2',
  `--remote_default_exec_properties=actiond-worker-sha256=${createHash('sha256').update(fs.readFileSync(`${work}/actiond-worker`)).digest('hex')}`,
  `--remote_executor=${endpoint}`, `--remote_cache=${endpoint}`,
  '--spawn_strategy=sandboxed,local', '--strategy=VrtCapture=remote', '--strategy=VrtCompare=remote',
  '--strategy=TestRunner=remote,local', '--remote_local_fallback=false', '--remote_upload_local_results=false',
  '--noremote_cache_compression', '--remote_download_outputs=all',
]
if (process.env.RULES_WEB_E2E_BAZELRC) command.push(`--bazelrc=${process.env.RULES_WEB_E2E_BAZELRC}`)
if (arch === 'arm64') flags.push('--extra_execution_platforms=@platforms//host:host,@rules_web_e2e//internal:linux_arm64')
const uncached = ['--remote_accept_cached=false', '--nocache_test_results']
const test = (...targets: string[]) => run([...command, 'test', ...targets, ...flags, '--test_output=errors'])
const capture = (name: string, fail = false) => run([...command, 'run', `//:${name}.update`, ...flags], {fail})
const result = (name: string, mode = 'capture') => {
  const directory = `bazel-bin/${name}_${mode}.results`
  const status = json(`${directory}/result.json`)
  assert.equal(status.mode, mode)
  assert.notEqual(status.exitCode, 0, JSON.stringify(status))
  return directory
}
const ids = (name: string) => new Set(files(`bazel-testlogs/${name}`).filter(p => p.endsWith('.log'))
  .flatMap(p => [...text(p).matchAll(/BROWSER_EXECUTION ([a-f0-9-]{36})/g)].map(match => match[1])))

async function cancelCapture(original: Buffer) {
  const baseline = '__actiond_cancel__/keep.png'
  fs.mkdirSync(path.dirname(baseline), {recursive: true})
  fs.writeFileSync(baseline, original)
  // Signal Bazel itself: older Bazelisk versions ignore client-only signals.
  let binary = bazel
  if (path.basename(binary) === 'bazelisk') {
    const environment = run([binary, '--print_env'], {stdio: 'pipe'})
    const search = environment.split('\n').find(line => line.startsWith('PATH='))?.slice(5)
    assert(search, 'Bazelisk did not expose its selected binary')
    binary = search.split(path.delimiter).map(dir => path.join(dir, 'bazel')).find(p => fs.existsSync(p))!
    assert(binary)
  }
  const log = `${work}/results/cancellation.log`
  const fd = fs.openSync(log, 'w')
  const child = spawn(binary, [...command.slice(1), 'run', '//:actiond_cancel_test.update', ...flags,
    '--progress_report_interval=1', '--curses=no', '--color=no'], {stdio: ['ignore', fd, fd], detached: true})
  fs.closeSync(fd)
  const finished = new Promise<{code: number | null, signal: NodeJS.Signals | null}>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({code, signal}))
  })
  const running = () => child.exitCode === null && child.signalCode === null
  try {
    const deadline = Date.now() + 90_000
    while (!text(log).includes('VrtCapture actiond_cancel_test_capture.results')) {
      assert(running() && Date.now() < deadline, `Capture was not dispatched: ${text(log)}`)
      await sleep(200)
    }
    // Bazel displays [Sched] even while actiond executes; allow the browser to start.
    await sleep(5000)
    assert(running(), text(log))
    child.kill('SIGINT')
    let timer: NodeJS.Timeout | undefined
    const status = await Promise.race([finished, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Cancellation timed out: ${text(log)}`)), 20_000)
    })]).finally(() => clearTimeout(timer))
    assert(status.code === 8 || status.code === 130 || status.signal === 'SIGINT', text(log))
  } finally {
    if (running() && child.pid) process.kill(-child.pid, 'SIGKILL')
    await finished
  }
  assert.deepEqual(fs.readFileSync(baseline), original)
  assert(!fs.existsSync('__actiond_cancel__/partial.png'))
}

try {
  if (arch === 'x64') {
    const log = run([...command, 'build', '//:actiond_local_rejection_test_capture',
      '--remote_executor=', '--remote_cache=', '--disk_cache=', '--spawn_strategy=sandboxed,local'],
    {fail: true, stdio: ['ignore', 'pipe', 'pipe']})
    fs.writeFileSync(`${work}/results/local-rejection.log`, log)
    assert(log.includes("VRT requires actiond's pinned glibc/Bash runtime"), log)
    test('//:actiond_e2e_test', '//:actiond_component_test', '//:actiond_browser_isolation_test')
    const missingFfmpeg = run([...command, 'test', '//:actiond_missing_ffmpeg_test', ...flags,
      ...uncached, '--test_output=errors'], {fail: true, stdio: 'pipe'})
    assert.match(missingFfmpeg, /Executable doesn't exist at[^\n]*ffmpeg-/)
    test('//:actiond_video_test', ...uncached)
    const videos = outputFiles('bazel-testlogs/actiond_video_test/test.outputs')
      .filter(file => file.name.endsWith('.webm'))
    assert.equal(videos.length, 1, 'Expected one downloaded video from the isolated browser')
    const video = videos[0].read()
    assert(video.length > 4, 'Video artifact is empty')
    assert.deepEqual(video.subarray(0, 4), Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), 'Expected a WebM/EBML header')
    run([...command, 'test', '//:actiond_browser_failure_test', ...flags,
      '--flaky_test_attempts=2', '--nocache_test_results', '--test_output=errors'], {fail: true})
    assert(text('bazel-testlogs/actiond_browser_failure_test/test.log').includes('Intentional ordinary browser failure'))
    assert.equal(ids('actiond_browser_failure_test').size, 2, 'Retries must launch two browsers')
    assert(outputFiles('bazel-testlogs/actiond_browser_failure_test/test.outputs').some(p => p.name.endsWith('junit.xml')))
    let previous = new Set<string>()
    for (let round = 0; round < 2; round++) {
      test('//:actiond_rerun_test', '--runs_per_test=2', '--nocache_test_results')
      const current = ids('actiond_rerun_test')
      assert.equal(current.size, 2, 'runs_per_test must launch two browsers')
      assert([...current].every(id => !previous.has(id)), 'nocache_test_results replayed a browser run')
      previous = current
    }
  }
  capture('actiond_package_test')
  nonempty('__actiond_package__/caller-package.png')
  test('//:actiond_package_test')
  capture('actiond_native_test')
  capture('actiond_gallery_test')
  nonempty('__actiond_native__/saved.png')
  nonempty('__actiond_gallery__/counter.png')
  test('//:actiond_native_test', '//:actiond_gallery_test', '//:actiond_isolation_test')
  const original = fs.readFileSync('__actiond_native__/saved.png')
  // Empty, failed, and timed-out captures must all preserve source references.
  for (const [name, directory] of [
    ['actiond_isolation_test', '__actiond_isolation__'],
    ['actiond_failure_test', '__actiond_failed__'],
    ['actiond_timeout_test', '__actiond_timeout__'],
  ]) {
    fs.mkdirSync(directory, {recursive: true})
    fs.writeFileSync(`${directory}/keep.png`, original)
    capture(name, true)
    assert.deepEqual(fs.readFileSync(`${directory}/keep.png`), original)
    const output = result(name)
    if (name !== 'actiond_isolation_test') nonempty(`${output}/artifacts/reference/partial.png`)
    if (name === 'actiond_failure_test') {
      assert(!fs.existsSync(`${directory}/partial.png`))
      nonempty(`${output}/artifacts/junit.xml`)
    }
  }
  // Freeze the runner's event loop; an independent watchdog bounds this probe.
  fs.mkdirSync('__actiond_deadline__', {recursive: true})
  fs.writeFileSync('__actiond_deadline__/keep.png', original)
  const started = Date.now()
  run([...command, 'run', '//:actiond_deadline_test.update', ...flags,
    '--remote_accept_cached=false'], {fail: true, timeout: 90_000})
  assert(Date.now() - started < 90_000)
  const deadlineOutput = result('actiond_deadline_test')
  nonempty(`${deadlineOutput}/artifacts/deadline-ready.png`)
  assert.equal(text(`${deadlineOutput}/artifacts/runner-stalled`), 'event loop blocked\n')
  assert.deepEqual(fs.readdirSync('__actiond_deadline__'), ['keep.png'])
  assert.deepEqual(fs.readFileSync('__actiond_deadline__/keep.png'), original)
  run([...command, 'test', '//:actiond_native_test', ...flags, ...uncached,
    '--test_output=errors'], {timeout: 120_000})
  // A deliberately wrong reference must produce downloaded diff images.
  fs.copyFileSync('__actiond_gallery__/counter.png', '__actiond_native__/saved.png')
  try {
    run([...command, 'test', '//:actiond_native_test', ...flags, '--test_output=errors'], {fail: true})
    assert(files(`${result('actiond_native_test', 'compare')}/artifacts`).some(p => p.endsWith('-diff.png')))
  } finally {
    fs.writeFileSync('__actiond_native__/saved.png', original)
  }
  await cancelCapture(original)
  test('//:actiond_native_test', ...uncached)
} finally {
  const destination = `${work}/results/public`
  fs.mkdirSync(destination, {recursive: true})
  for (const directory of ['.', 'bazel-testlogs', 'bazel-bin']) {
    if (!fs.existsSync(directory)) continue
    for (const name of fs.readdirSync(directory)) {
      const collect = directory === '.' ? name.startsWith('__actiond') :
        name.startsWith('actiond_') && name.endsWith(directory === 'bazel-testlogs' ? '_test' : '.results')
      if (!collect) continue
      fs.cpSync(path.join(directory, name), path.join(destination, name), {recursive: true, dereference: true})
    }
  }
}
