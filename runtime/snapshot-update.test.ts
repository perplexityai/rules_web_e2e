import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {applySnapshotUpdate, snapshotHashes} from './snapshot-update.js'

test('selected updates preserve untouched baselines and reject changed destinations', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'snapshots-')))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const generated = path.join(root, 'generated')
  const destination = path.join(root, 'baseline')
  fs.mkdirSync(path.join(generated, 'project-one'), {recursive: true})
  fs.mkdirSync(destination)
  fs.writeFileSync(path.join(generated, 'project-one/page.png'), 'capture')
  fs.writeFileSync(path.join(destination, 'untouched.png'), 'keep')
  const before = snapshotHashes(destination)
  applySnapshotUpdate(generated, destination, before)
  assert.equal(fs.readFileSync(path.join(destination, 'project-one/page.png'), 'utf8'), 'capture')
  assert.equal(fs.readFileSync(path.join(destination, 'untouched.png'), 'utf8'), 'keep')
  assert.throws(() => applySnapshotUpdate(generated, destination, before), /changed during capture/)
  assert.throws(() => applySnapshotUpdate(path.join(root, 'empty'), destination, snapshotHashes(destination)), /no snapshots/)
  fs.symlinkSync(root, path.join(destination, 'escape'))
  assert.throws(() => snapshotHashes(destination), /regular files/)
})

test('reject capture symlinks and preexisting update locks', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'snapshots-')))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const generated = path.join(root, 'generated')
  const destination = path.join(root, 'baseline')
  fs.mkdirSync(generated)
  fs.symlinkSync(root, path.join(generated, 'escape'))
  assert.throws(() => applySnapshotUpdate(generated, destination, {}), /regular files/)
  fs.unlinkSync(path.join(generated, 'escape'))
  fs.writeFileSync(path.join(generated, 'page.png'), 'capture')
  fs.mkdirSync(destination + '.snapshot-update.lock')
  assert.throws(() => applySnapshotUpdate(generated, destination, {}), /already updating/)
  assert(!fs.existsSync(destination))
})

test('dangling destination symlinks cannot create files outside the root', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'snapshots-')))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const generated = path.join(root, 'generated')
  fs.mkdirSync(generated)
  fs.writeFileSync(path.join(generated, 'page.png'), 'capture')
  const outside = path.join(root, 'not-created')
  fs.symlinkSync(outside, path.join(root, 'link'))
  assert.throws(() => applySnapshotUpdate(generated, path.join(root, 'link/baselines'), {}), /symlinks/)
  assert(!fs.existsSync(outside))
})

test('does not remove a preexisting temporary file', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'snapshots-')))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const generated = path.join(root, 'generated')
  const destination = path.join(root, 'baseline')
  fs.mkdirSync(generated)
  fs.mkdirSync(destination)
  fs.writeFileSync(path.join(generated, 'page.png'), 'capture')
  const existing = path.join(destination, `page.png.${process.pid}.tmp`)
  fs.writeFileSync(existing, 'keep')
  assert.throws(() => applySnapshotUpdate(generated, destination, snapshotHashes(destination)), /EEXIST/)
  assert.equal(fs.readFileSync(existing, 'utf8'), 'keep')
})
