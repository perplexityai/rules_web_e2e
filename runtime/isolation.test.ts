import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {networkTargets} from './network.js'
import {stageRunfiles, testEnvironment} from './isolation.js'

test('staging excludes adjacent files and preserves a single npm package identity', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-staging-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const source = path.join(root, 'bin')
  const staged = path.join(root, 'inputs')
  fs.mkdirSync(path.join(source, 'package'), {recursive: true})
  fs.writeFileSync(path.join(source, 'config.ts'), 'declared')
  fs.writeFileSync(path.join(source, '.env.local'), 'VITE_LEAK=ambient')
  fs.writeFileSync(
    path.join(source, 'package', 'index.js'),
    'module.exports = {}'
  )
  const manifest = path.join(root, 'MANIFEST')
  fs.writeFileSync(
    manifest,
    [
      `_main/config.ts ${source}/config.ts`,
      `_main/node_modules/.store/pkg ${source}/package`,
      '_main/node_modules/pkg .store/pkg',
    ].join('\n')
  )
  stageRunfiles(manifest, staged)
  assert.equal(
    fs.readFileSync(path.join(staged, '_main/config.ts'), 'utf8'),
    'declared'
  )
  assert.equal(fs.existsSync(path.join(staged, '_main/.env.local')), false)
  assert.equal(
    fs.realpathSync(path.join(staged, '_main/node_modules/pkg')),
    fs.realpathSync(path.join(staged, '_main/node_modules/.store/pkg'))
  )
  fs.writeFileSync(path.join(source, 'config.ts'), 'changed after staging')
  assert.equal(
    fs.readFileSync(path.join(staged, '_main/config.ts'), 'utf8'),
    'declared'
  )
})

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

test('network opt-ins require explicit origins and keep port boundaries', () => {
  assert.equal(
    networkTargets('http://127.0.0.1:4567/', [
      'https://fixtures.example',
      'http://localhost:8080',
    ]),
    '127.0.0.1:4567,fixtures.example:443,localhost:8080'
  )
  for (const origin of [
    '*',
    'https://*.example',
    'https://user:pass@example.com',
    'https://example.com/path',
    'file:///tmp/file',
  ])
    assert.throws(() => networkTargets('http://127.0.0.1:4567', [origin]))
})
