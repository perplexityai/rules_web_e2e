import assert from 'node:assert/strict'
import fs from 'node:fs'
import {test} from 'node:test'
import {workerInputs} from './inputs.js'

test('resolves worker inputs from a consuming module', () => {
  // Use the small manifest as both inputs; no worker download or VM required.
  const {worker, manifest} = workerInputs(process.argv[2], process.argv[2], process.argv[3])
  assert.equal(worker, fs.realpathSync(worker))
  assert.deepEqual(JSON.parse(fs.readFileSync(worker, 'utf8')), manifest)
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/)
  assert.equal(typeof manifest.version, 'string')
})
