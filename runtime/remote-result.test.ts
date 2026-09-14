import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {consumeRemoteResult} from './remote-result.js'
import {runRemoteJob} from './remote-job.js'

test('failed remote capture preserves local baselines and returns failure artifacts', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-result-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const remote = path.join(root, 'remote')
  const workspace = path.join(root, 'workspace')
  fs.mkdirSync(path.join(remote, 'artifacts'), {recursive: true})
  fs.mkdirSync(path.join(remote, 'baselines'))
  fs.mkdirSync(path.join(workspace, 'screenshots'), {recursive: true})
  fs.writeFileSync(path.join(workspace, 'screenshots/old.png'), 'keep')
  fs.writeFileSync(path.join(remote, 'baselines/partial.png'), 'partial')
  fs.writeFileSync(path.join(remote, 'artifacts/junit.xml'), '<testsuite failures="1"/>')
  fs.writeFileSync(path.join(remote, 'result.json'), JSON.stringify({schemaVersion: 1, mode: 'capture', exitCode: 7}))
  const artifacts = path.join(root, 'downloaded')
  const update = {workspace, baselineRelative: 'screenshots'}
  assert.equal(consumeRemoteResult(remote, {artifacts, update}), 7)
  assert.equal(fs.readFileSync(path.join(artifacts, 'junit.xml'), 'utf8'), '<testsuite failures="1"/>')
  assert.deepEqual(fs.readdirSync(path.join(workspace, 'screenshots')), ['old.png'])

  fs.writeFileSync(path.join(remote, 'result.json'), JSON.stringify({schemaVersion: 1, mode: 'capture', exitCode: 0}))
  fs.unlinkSync(path.join(remote, 'baselines/partial.png'))
  assert.throws(() => consumeRemoteResult(remote, {update}), /no screenshots/)
  assert.equal(fs.readFileSync(path.join(workspace, 'screenshots/old.png'), 'utf8'), 'keep')
  fs.writeFileSync(path.join(remote, 'baselines/new.png'), 'complete')
  assert.equal(consumeRemoteResult(remote, {update}), 0)
  assert.deepEqual(fs.readdirSync(path.join(workspace, 'screenshots')), ['new.png'])
  assert.equal(fs.readFileSync(path.join(workspace, 'screenshots/new.png'), 'utf8'), 'complete')
})

test('result metadata and artifact links cannot bypass local validation', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-result-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  fs.mkdirSync(path.join(root, 'artifacts'))
  for (const result of [
    {schemaVersion: 2, mode: 'compare', exitCode: 0},
    {schemaVersion: 1, mode: 'capture', exitCode: 0},
    {schemaVersion: 1, mode: 'compare', exitCode: -1},
    {schemaVersion: 1, mode: 'compare', exitCode: null},
  ]) {
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result))
    assert.throws(() => consumeRemoteResult(root), /Invalid remote VRT result/)
  }
  fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({schemaVersion: 1, mode: 'compare', exitCode: 1}))
  fs.symlinkSync(process.execPath, path.join(root, 'artifacts/escape'))
  assert.throws(() => consumeRemoteResult(root, {artifacts: path.join(root, 'downloads')}), /only regular files/)
})

test('remote job preserves a failing subprocess result for the local test', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-bootstrap-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const runner = path.join(root, 'consumer.mjs')
  fs.writeFileSync(runner, `import fs from 'node:fs';
    fs.writeFileSync(process.env.TEST_UNDECLARED_OUTPUTS_DIR + '/junit.xml', '<failure/>');
    process.exitCode = 7;`)
  const output = path.join(root, 'output')
  const node = fs.realpathSync(process.env.JS_BINARY__NODE_BINARY || process.execPath)
  runRemoteJob({runfiles: {}, runner, env: {}, args: [], output, mode: 'test'}, node, {NODE_OPTIONS: ''})
  const artifacts = path.join(root, 'test-artifacts')
  assert.equal(consumeRemoteResult(output, {artifacts, mode: 'test'}), 7)
  assert.equal(fs.readFileSync(path.join(artifacts, 'junit.xml'), 'utf8'), '<failure/>')
})
