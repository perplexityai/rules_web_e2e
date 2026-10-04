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
      runner,
      env: {VRT_TIMEOUT_MS: '100'},
      args: [],
      output,
      mode: 'capture',
    }, fs.realpathSync(process.env.JS_BINARY__NODE_BINARY || process.execPath))

    assert.ok(performance.now() - start < 5000)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'result.json'), 'utf8')), {
      schemaVersion: 1,
      mode: 'capture',
      exitCode: 1,
    })
  } finally {
    fs.rmSync(root, {recursive: true, force: true})
  }
})

test('capture reads the supplied Bazel runfiles tree and preserves its identity', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-runfiles-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const runfiles = path.join(root, 'launcher.runfiles')
  fs.mkdirSync(path.join(runfiles, 'consumer'), {recursive: true})
  fs.writeFileSync(path.join(runfiles, 'consumer', 'fixture.txt'), 'declared input')
  const runner = path.join(root, 'capture.cjs')
  fs.writeFileSync(runner, `
    const fs = require('node:fs');
    const path = require('node:path');
    fs.writeFileSync(path.join(process.env.TEST_UNDECLARED_OUTPUTS_DIR, 'observed.json'), JSON.stringify({
      root: process.env.RUNFILES_DIR,
      input: fs.readFileSync(path.join(process.env.RUNFILES_DIR, 'consumer/fixture.txt'), 'utf8'),
      update: process.argv.includes('--update'),
    }));
  `)
  const output = path.join(root, 'result')
  runRemoteJob({runner, env: {VRT_TIMEOUT_MS: '10000'}, args: [], output, mode: 'capture'},
    fs.realpathSync(process.env.JS_BINARY__NODE_BINARY || process.execPath), {RUNFILES_DIR: runfiles, NODE_OPTIONS: ''})
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'artifacts/observed.json'), 'utf8')), {
    root: runfiles, input: 'declared input', update: true,
  })
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'result.json'), 'utf8')), {
    schemaVersion: 1, mode: 'capture', exitCode: 0,
  })
  assert.equal(fs.readFileSync(path.join(runfiles, 'consumer/fixture.txt'), 'utf8'), 'declared input')
})
