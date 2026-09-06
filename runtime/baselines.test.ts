import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {baselineDestination, updateBaselines} from './baselines.js'

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
