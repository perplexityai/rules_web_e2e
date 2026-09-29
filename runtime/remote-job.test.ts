import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {runRemoteJob} from './remote-job.js'

test('bounds a remote child that never exits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-vrt-timeout-'))
  try {
    const runner = path.join(root, 'stuck.cjs')
    const output = path.join(root, 'result')
    fs.writeFileSync(runner, 'setInterval(() => {}, 1000)\n')

    const start = performance.now()
    runRemoteJob({
      runfiles: {},
      runner,
      env: {VRT_TIMEOUT_MS: '100'},
      args: [],
      output,
      mode: 'compare',
    }, process.execPath)

    assert.ok(performance.now() - start < 5000)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'result.json'), 'utf8')), {
      schemaVersion: 1,
      mode: 'compare',
      exitCode: 1,
    })
  } finally {
    fs.rmSync(root, {recursive: true, force: true})
  }
})
