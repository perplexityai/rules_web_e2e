import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {consumerTest, json, nonempty, run} from './harness.ts'

const electron = {
  'darwin-arm64': ['bfa742c44b0053a9b6cf46a8124baff4a8a567feca2a5adbabf749075b298b69', 'Electron.app/Contents/MacOS/Electron'],
  'darwin-x64': ['0120bcbd5cd063953b477fe8f950244b2f37770b9f85e60ca9b6bcaf85627b33', 'Electron.app/Contents/MacOS/Electron'],
  'linux-x64': ['2ac22df42a4368cdd93ff9f9f25c7f04b9157143a3a3a06d4f01ae0dbb4e6fd5', 'electron'],
} as const
const platform = `${process.platform}-${process.arch}` as keyof typeof electron
assert(platform in electron, `Unsupported process fixture platform: ${platform}`)
const [sha256, electronExecutable] = electron[platform]
const cache = process.env.PLAYWRIGHT_BROWSERS_PATH
assert(cache, 'Provision Chromium before running this harness')
const browser = fs.readdirSync(cache).find(name => /^chromium_headless_shell-\d+$/.test(name))
assert(browser, 'Missing provisioned Chromium')
const chromiumRoot = fs.realpathSync(path.join(cache, browser))
const chromiumExecutable = process.platform === 'darwin'
  ? `chrome-headless-shell-mac-${process.arch}/chrome-headless-shell`
  : 'chrome-headless-shell-linux64/chrome-headless-shell'
const build = (executable: string) => `
filegroup(name = "files", srcs = glob(["**"], exclude = ["BUILD.bazel"]), visibility = ["//visibility:public"])
filegroup(name = "executable", srcs = [${JSON.stringify(executable)}], visibility = ["//visibility:public"])
`

consumerTest((work, consumer, command) => {
  fs.appendFileSync(path.join(consumer, 'MODULE.bazel'), `
new_local_repository = use_repo_rule("@bazel_tools//tools/build_defs/repo:local.bzl", "new_local_repository")
new_local_repository(name = "owned_chromium", path = ${JSON.stringify(chromiumRoot)}, build_file_content = ${JSON.stringify(build(chromiumExecutable))})
http_archive(name = "owned_electron", urls = ["https://github.com/electron/electron/releases/download/v40.0.0/electron-v40.0.0-${platform}.zip"], sha256 = "${sha256}", build_file_content = ${JSON.stringify(build(electronExecutable))})
`)
  const cases = ['chromium_test', 'chromium_timeout_test', 'electron_test', 'electron_timeout_test']
  const targets = process.argv.length > 2 ? process.argv.slice(2) : cases
  assert(targets.every(target => cases.includes(target)), 'Unknown process test target')
  run([...command, 'build', ...targets.map(target => `//process:${target}`)], {cwd: consumer})
  for (const target of targets) {
    const output = path.join(work, target)
    fs.mkdirSync(output)
    try {
      const result = spawnSync(`${consumer}/bazel-bin/process/${target}_/${target}`, {
        cwd: consumer, encoding: 'utf8', timeout: 60_000, killSignal: 'SIGKILL',
        env: {...process.env, BAZEL_BINDIR: '.', TEST_TMPDIR: work,
          TEST_UNDECLARED_OUTPUTS_DIR: output, XML_OUTPUT_FILE: `${output}/test.xml`},
      })
      fs.writeFileSync(path.join(output, 'runner.log'), result.stdout + result.stderr)
      assert.ifError(result.error)
      const log = result.stdout + result.stderr
      if (target.includes('timeout')) {
        assert.equal(result.status, 1, log)
        assert.match(log, /VRT exceeded its execution timeout/)
      } else {
        assert.equal(result.status, 0, log)
        assert.match(log, /1 passed/)
      }
      nonempty(`${output}/browser.png`)
      const {pids, scratch, profile} = json(`${output}/processes.json`)
      for (const pid of pids) {
        const deadline = Date.now() + 3000
        let state = ''
        do {
          state = spawnSync('/bin/ps', ['-o', 'stat=,command=', '-p', String(pid)], {encoding: 'utf8'}).stdout.trim()
          if (!state || state.startsWith('Z')) break
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
        } while (Date.now() < deadline)
        assert(!state || state.startsWith('Z'), `Process ${pid} survived ${target}: ${state}`)
      }
      assert(!fs.existsSync(scratch), `Runner leaked ${scratch}`)
      assert(!fs.existsSync(profile), `Runner leaked ${profile}`)
      console.log(`${target}: screenshot, process cleanup, and scratch cleanup passed`)
    } finally {
      if (process.env.E2E_TEST_ARTIFACTS)
        fs.cpSync(output, path.join(process.env.E2E_TEST_ARTIFACTS, target), {recursive: true})
      if (fs.existsSync(`${output}/processes.json`)) {
        for (const pid of json(`${output}/processes.json`).pids) {
          try { process.kill(pid, 'SIGKILL') } catch {}
        }
      }
    }
  }
})
