import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {consumerTest, json, nonempty, run} from './harness.ts'

consumerTest((work, consumer, command) => {
  run([...command, 'build', '//:host_lingering_test'], {cwd: consumer})
  const output = path.join(work, 'artifacts')
  fs.mkdirSync(output)
  try {
    const result = spawnSync(`${consumer}/bazel-bin/host_lingering_test_/host_lingering_test`, {
      cwd: consumer, encoding: 'utf8', timeout: 20_000, killSignal: 'SIGKILL',
      env: {...process.env, BAZEL_BINDIR: '.', TEST_TMPDIR: work,
        TEST_UNDECLARED_OUTPUTS_DIR: output, XML_OUTPUT_FILE: `${output}/test.xml`},
    })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /1 passed/)
    assert.match(result.stdout, /final useful output/)
    assert.match(result.stderr, /final useful error/)
    assert.doesNotMatch(result.stdout + result.stderr, /private-lingering-cookie|private-lingering-token/)
    nonempty(`${output}/browser.png`)
    const {pid, scratch} = json(`${output}/descendant.json`)
    assert(!fs.existsSync(scratch), `Runner leaked ${scratch}`)
    const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'}).stdout.trim()
    assert(!state || state.startsWith('Z'), `Descendant ${pid} survived: ${state}`)
  } finally {
    if (fs.existsSync(`${output}/descendant.json`)) {
      try { process.kill(json(`${output}/descendant.json`).pid, 'SIGKILL') } catch {}
    }
  }
})
