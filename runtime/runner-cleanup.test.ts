import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import {browserTempRoot} from './isolation.js'

test('runner removes scratch after setup fails without deleting failure artifacts', context => {
  const root = fs.mkdtempSync(path.join(browserTempRoot(os.tmpdir()), 'cleanup-'))
  context.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const artifacts = path.join(root, 'artifacts')
  fs.mkdirSync(artifacts)
  fs.writeFileSync(path.join(artifacts, 'failure.txt'), 'keep')
  fs.writeFileSync(path.join(root, 'descriptor.json'), '{invalid')
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./runner.js', import.meta.url))], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TEST_TMPDIR: root,
      TEST_UNDECLARED_OUTPUTS_DIR: artifacts,
      RUNFILES_DIR: root,
      VRT_DESCRIPTOR: 'descriptor.json',
      VRT_MODE: 'e2e',
      VRT_BASE_URL: 'http://127.0.0.1:12345',
      VRT_BASE_URL_ENV: undefined,
    },
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /SyntaxError/)
  assert.deepEqual(fs.readdirSync(root).sort(), ['artifacts', 'descriptor.json'])
  assert.equal(fs.readFileSync(path.join(artifacts, 'failure.txt'), 'utf8'), 'keep')
})
