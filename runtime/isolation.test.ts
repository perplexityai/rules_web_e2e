import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {browserTempRoot, removeScratch, testEnvironment} from './isolation.js'

test('undeclared shell variables cannot change compare versus update', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-env-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const compare = testEnvironment({FIXTURE: 'declared'}, ['FIXTURE'], root)
  const update = testEnvironment(
    {
      FIXTURE: 'declared',
      VITE_LEAK: 'ambient',
      NODE_OPTIONS: '--require=/host/inject.js',
      HOME: '/host',
      PATH: '/host/bin',
    },
    ['FIXTURE'],
    root
  )
  assert.deepEqual(update, compare)
  assert.equal(update.FIXTURE, 'declared')
  assert.equal(update.HOME, path.join(root, 'home'))
})

test('cleanup removes staged read-only directories without following links', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-cleanup-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const temp = path.join(root, 'temp')
  const staged = path.join(temp, 'inputs', 'package')
  fs.mkdirSync(staged, {recursive: true})
  fs.writeFileSync(path.join(staged, 'index.js'), 'copied runfile')
  const external = path.join(root, 'external.txt')
  fs.writeFileSync(external, 'keep')
  fs.symlinkSync(external, path.join(staged, 'external.txt'))
  fs.chmodSync(staged, 0o555)
  fs.chmodSync(path.dirname(staged), 0o555)

  removeScratch(temp)

  assert.equal(fs.existsSync(temp), false)
  assert.equal(fs.readFileSync(external, 'utf8'), 'keep')
})

test('browser temp root stays below Chromium socket path limits', () => {
  assert.equal(browserTempRoot('/short/tmp', 'linux'), '/short/tmp')
  assert.equal(browserTempRoot('/deep/bazel/workspace/' + 'nested/'.repeat(8), 'linux'), '/tmp')
  assert.equal(browserTempRoot('/deep/bazel/workspace/' + 'nested/'.repeat(8), 'win32'), '/deep/bazel/workspace/' + 'nested/'.repeat(8))
})
