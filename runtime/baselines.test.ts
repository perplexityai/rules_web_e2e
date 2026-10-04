import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {baselineDestination, baselineHashes, updateBaselines, withBaselineUpdate, materializeSnapshots} from './baselines.js'

test('updates captures, removes stale PNGs, and preserves unrelated files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const generated = path.join(root, 'generated')
  const destination = path.join(root, 'baselines')
  fs.mkdirSync(generated)
  fs.mkdirSync(destination)
  fs.writeFileSync(path.join(generated, 'editor.png'), 'new capture')
  fs.writeFileSync(path.join(destination, 'old.png'), 'stale')
  fs.writeFileSync(path.join(destination, 'README.md'), 'keep')
  updateBaselines(generated, destination)
  assert.equal(
    fs.readFileSync(path.join(destination, 'editor.png'), 'utf8'),
    'new capture'
  )
  assert.deepEqual(fs.readdirSync(destination).sort(), [
    'README.md',
    'editor.png',
  ])
  fs.unlinkSync(path.join(generated, 'editor.png'))
  assert.throws(() => updateBaselines(generated, destination), /no screenshots/)
  assert.equal(
    fs.readFileSync(path.join(destination, 'editor.png'), 'utf8'),
    'new capture'
  )
})

test('baseline writes cannot escape through traversal or directory symlinks', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  for (const relative of ['../outside', '/outside', 'a/../b', '', 'a//b']) {
    assert.throws(
      () => baselineDestination(root, relative),
      /relative directory/
    )
  }
  fs.symlinkSync(os.tmpdir(), path.join(root, 'link'))
  assert.throws(() => baselineDestination(root, 'link/screenshots'), /symlinks/)
  assert.equal(
    baselineDestination(root, 'editor/screenshots'),
    path.join(root, 'editor/screenshots')
  )
})

test('capture hashes declared runfile symlinks without accepting source symlinks', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-runfiles-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const source = path.join(root, 'source.png')
  const runfiles = path.join(root, 'runfiles')
  fs.writeFileSync(source, 'baseline')
  fs.mkdirSync(runfiles)
  fs.symlinkSync(source, path.join(runfiles, 'baseline.png'))

  assert.deepEqual(Object.keys(baselineHashes(runfiles, true)), ['baseline.png'])
  assert.throws(() => baselineHashes(runfiles), /regular files/)
})

test('declared snapshot trees preserve inputs and share update guards', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'declared-snapshots-')))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const source = path.join(root, 'source')
  const output = path.join(root, 'output')
  const captured = path.join(root, 'captured')
  fs.mkdirSync(path.join(source, 'project'), {recursive: true})
  fs.mkdirSync(path.join(captured, 'project'), {recursive: true})
  fs.writeFileSync(path.join(source, 'project/keep.png'), 'keep')
  fs.writeFileSync(path.join(source, 'project/change.png'), 'old')
  fs.writeFileSync(path.join(captured, 'project/change.png'), 'new')
  materializeSnapshots(source, output)
  materializeSnapshots(captured, output, true)
  assert.equal(fs.readFileSync(path.join(output, 'project/keep.png'), 'utf8'), 'keep')
  assert.equal(fs.readFileSync(path.join(output, 'project/change.png'), 'utf8'), 'new')
  const before = baselineHashes(source, false, true)
  let invoked = false
  withBaselineUpdate(source, before, () => {invoked = true}, true)
  assert(invoked)
  fs.writeFileSync(path.join(source, 'undeclared.txt'), 'keep')
  assert.throws(() => withBaselineUpdate(source, before, () => assert.fail('writer ran'), true), /changed during capture/)
  fs.symlinkSync(path.join(root, 'missing'), path.join(root, 'link'))
  assert.throws(() => baselineDestination(root, 'link/baselines'), /symlinks/)
  fs.symlinkSync(root, path.join(source, 'escape'))
  assert.throws(() => baselineHashes(source, false, true), /regular files/)
})
