import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {removeStagedTemp, stageRunfiles, testEnvironment} from './isolation.js'

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

test('staging skips dangling optional package links but rejects missing runfiles', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-optional-runfiles-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const packageDir = path.join(root, 'node_modules')
  fs.mkdirSync(packageDir)
  const optional = path.join(packageDir, 'binding-darwin-arm64')
  fs.symlinkSync('missing-darwin-package', optional)
  const manifest = path.join(root, 'MANIFEST')
  const staged = path.join(root, 'inputs')
  fs.writeFileSync(manifest, `_main/node_modules/binding-darwin-arm64 ${optional}\n`)

  stageRunfiles(manifest, staged)

  assert.equal(fs.existsSync(path.join(staged, '_main/node_modules/binding-darwin-arm64')), false)
  fs.writeFileSync(manifest, `_main/required ${path.join(root, 'missing-required')}\n`)
  assert.throws(() => stageRunfiles(manifest, staged), {code: 'ENOENT'})
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

  removeStagedTemp(temp)

  assert.equal(fs.existsSync(temp), false)
  assert.equal(fs.readFileSync(external, 'utf8'), 'keep')
})
