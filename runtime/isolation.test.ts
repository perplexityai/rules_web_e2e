import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
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

test('staging preserves nested npm links so packages resolve declared dependencies', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-npm-links-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const source = path.join(root, 'bin/node_modules/.store')
  const staged = path.join(root, 'inputs')
  const packageDir = path.join(source, 'package/node_modules/package')
  const dependencyDir = path.join(source, 'dependency/node_modules/dependency')
  fs.mkdirSync(packageDir, {recursive: true})
  fs.mkdirSync(dependencyDir, {recursive: true})
  fs.writeFileSync(path.join(packageDir, 'index.js'), 'module.exports = require("dependency")')
  fs.writeFileSync(path.join(dependencyDir, 'index.js'), 'module.exports = "declared"')
  fs.symlinkSync('../../dependency/node_modules/dependency', path.join(source, 'package/node_modules/dependency'))
  const manifest = path.join(root, 'MANIFEST')
  fs.writeFileSync(manifest, [
    `_main/node_modules/.store/package/node_modules/package ${packageDir}`,
    `_main/node_modules/.store/dependency/node_modules/dependency ${dependencyDir}`,
    `_main/node_modules/.store/package/node_modules/dependency ${source}/package/node_modules/dependency`,
  ].join('\n'))

  stageRunfiles(manifest, staged)

  const nestedLink = path.join(staged, '_main/node_modules/.store/package/node_modules/dependency')
  assert.equal(fs.lstatSync(nestedLink).isSymbolicLink(), true)
  assert.equal(createRequire(path.join(staged, '_main/node_modules/.store/package/node_modules/package/index.js'))('./index.js'), 'declared')
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
