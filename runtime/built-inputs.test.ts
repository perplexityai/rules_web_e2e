import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {serveDirectory} from './static-server.js'
import {screenshotMatching} from './matching.js'
import {validatePlaywrightVersions} from './versions.js'

test('serves a built shell and assets without exposing adjacent files or symlinks', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'shell-'))
  t.after(() => fs.rm(temp, {recursive: true, force: true}))
  const root = path.join(temp, 'dist')
  await fs.mkdir(root)
  await fs.writeFile(
    path.join(root, 'gallery.html'),
    '<main>Built shell</main>'
  )
  await fs.writeFile(path.join(root, 'app.js'), 'export const ready = true')
  await fs.writeFile(path.join(temp, 'secret'), 'outside')
  await fs.symlink(path.join(temp, 'secret'), path.join(root, 'link'))
  const server = await serveDirectory(root, 'gallery.html')
  t.after(() => server.close())
  assert.equal(
    await (await fetch(server.url)).text(),
    '<main>Built shell</main>'
  )
  const script = await fetch(new URL('app.js', server.url))
  assert.match(script.headers.get('content-type')!, /javascript/)
  assert.equal(await script.text(), 'export const ready = true')
  for (const url of ['link', '%2e%2e%2fsecret', 'missing.ts', 'app.js.map'])
    assert.equal((await fetch(new URL(url, server.url))).status, 404, url)
  assert.equal((await fetch(server.url, {method: 'POST'})).status, 405)
  assert.equal(await (await fetch(server.url, {method: 'HEAD'})).text(), '')
  await assert.rejects(
    serveDirectory(root, '../secret'),
    /within the asset directory/
  )
})

test('matching validates pixel budgets and preserves an explicit pixel-count budget', () => {
  assert.deepEqual(screenshotMatching({maxDiffPixels: 5}), {
    threshold: 0.1,
    maxDiffPixels: 5,
  })
  assert.deepEqual(
    screenshotMatching({threshold: 0.2, maxDiffPixelRatio: 0.01}),
    {threshold: 0.2, maxDiffPixelRatio: 0.01}
  )
  for (const value of [
    {maxDiffPixels: 0.5},
    {threshold: 2},
    {maxDiffPixelRatio: -1},
    {threshold: NaN},
    {maxDiffPixels: 1, maxDiffPixelRatio: 0.1},
  ])
    assert.throws(() => screenshotMatching(value))
})

test('requires stable Playwright >= 1.63 with matching test and core packages', () => {
  validatePlaywrightVersions('1.63.0', '1.63.0', '1.63.0')
  validatePlaywrightVersions('1.64.0', '1.64.0', '1.64.0')
  for (const version of ['1.62.9', '0.99.0', '1.63', '1.64.0-beta'])
    assert.throws(
      () => validatePlaywrightVersions(version, version, version),
      />= 1.63/
    )
  assert.throws(
    () => validatePlaywrightVersions('1.64.0', '1.63.0', '1.64.0'),
    /mismatch/
  )
  assert.throws(
    () => validatePlaywrightVersions('1.64.0', '1.64.0', '1.63.0'),
    /mismatch/
  )
})
