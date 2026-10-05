import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {baselineDestination, baselineHashes, validateBaselines, withBaselineUpdate} from './baselines.js'

test('Bazel directory updates reject empty captures and mixed source directories', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  assert.throws(() => validateBaselines(root, true), /no screenshots/)
  fs.writeFileSync(path.join(root, 'image.png'), 'capture')
  validateBaselines(root, true)
  fs.writeFileSync(path.join(root, 'README.md'), 'keep')
  assert.throws(() => validateBaselines(root), /unrelated files/)
  fs.unlinkSync(path.join(root, 'README.md'))
  fs.symlinkSync(path.join(root, 'image.png'), path.join(root, 'link.png'))
  assert.throws(() => validateBaselines(root), /regular PNG/)
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

test('nested snapshot trees share source update guards', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'declared-snapshots-')))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const source = path.join(root, 'source')
  fs.mkdirSync(path.join(source, 'project'), {recursive: true})
  fs.writeFileSync(path.join(source, 'project/keep.png'), 'keep')
  fs.writeFileSync(path.join(source, 'project/change.png'), 'old')
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
