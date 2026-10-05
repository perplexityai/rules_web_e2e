import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {spawnSync} from 'node:child_process'
import {consumeRemoteResult} from './remote-result.js'
import {runRemoteJob} from './remote-job.js'

const TEST_VRT_TIMEOUT_MS = '10000'

test('failed remote capture preserves local baselines and returns failure artifacts', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-result-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const remote = path.join(root, 'remote')
  const workspace = path.join(root, 'workspace')
  fs.mkdirSync(path.join(remote, 'artifacts'), {recursive: true})
  fs.mkdirSync(path.join(remote, 'baselines'))
  fs.mkdirSync(path.join(workspace, 'screenshots'), {recursive: true})
  fs.writeFileSync(path.join(workspace, 'screenshots/old.png'), 'keep')
  fs.writeFileSync(path.join(remote, 'baseline-before.json'), JSON.stringify({
    'old.png': createHash('sha256').update('keep').digest('hex'),
  }))
  fs.writeFileSync(path.join(remote, 'baselines/partial.png'), 'partial')
  fs.writeFileSync(path.join(remote, 'artifacts/junit.xml'), '<testsuite failures="1"/>')
  fs.writeFileSync(path.join(remote, 'result.json'), JSON.stringify({schemaVersion: 1, mode: 'capture', exitCode: 7}))
  const update = {workspace, baselineRelative: 'screenshots'}
  assert.equal(consumeRemoteResult(remote, {update}), 7)
  assert.equal(fs.readFileSync(path.join(remote, 'artifacts/junit.xml'), 'utf8'), '<testsuite failures="1"/>')
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

test('edits made during capture are not overwritten by the result consumer', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-edit-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const remote = path.join(root, 'remote')
  const workspace = path.join(root, 'workspace')
  const destination = path.join(workspace, 'screenshots')
  fs.mkdirSync(path.join(remote, 'baselines'), {recursive: true})
  fs.mkdirSync(destination, {recursive: true})
  fs.writeFileSync(path.join(destination, 'old.png'), 'before capture')
  const before = createHash('sha256').update('before capture').digest('hex')
  fs.writeFileSync(path.join(remote, 'baseline-before.json'), JSON.stringify({'old.png': before}))
  fs.writeFileSync(path.join(remote, 'baselines/new.png'), 'new capture')
  fs.writeFileSync(path.join(remote, 'result.json'), JSON.stringify({schemaVersion: 1, mode: 'capture', exitCode: 0}))

  fs.writeFileSync(path.join(destination, 'old.png'), 'edited during capture')
  assert.throws(
    () => consumeRemoteResult(remote, {update: {workspace, baselineRelative: 'screenshots'}}),
    /changed during capture/
  )
  assert.equal(fs.readFileSync(path.join(destination, 'old.png'), 'utf8'), 'edited during capture')
  assert.equal(fs.existsSync(path.join(destination, 'new.png')), false)
})

test('a concurrent update cannot write into a locked baseline directory', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-lock-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const remote = path.join(root, 'remote')
  const workspace = path.join(root, 'workspace')
  const destination = path.join(workspace, 'screenshots')
  fs.mkdirSync(path.join(remote, 'baselines'), {recursive: true})
  fs.mkdirSync(destination, {recursive: true})
  fs.writeFileSync(path.join(remote, 'baseline-before.json'), '{}')
  fs.writeFileSync(path.join(remote, 'baselines/new.png'), 'new capture')
  fs.writeFileSync(path.join(remote, 'result.json'), JSON.stringify({schemaVersion: 1, mode: 'capture', exitCode: 0}))
  fs.mkdirSync(destination + '.vrt-update.lock')

  assert.throws(
    () => consumeRemoteResult(remote, {update: {workspace, baselineRelative: 'screenshots'}}),
    /already updating/
  )
  assert.equal(fs.existsSync(path.join(destination, 'new.png')), false)
})

test('result metadata cannot bypass local validation', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-result-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  fs.mkdirSync(path.join(root, 'artifacts'))
  for (const result of [
    {schemaVersion: 2, mode: 'capture', exitCode: 0},
    {schemaVersion: 1, mode: 'compare', exitCode: 0},
    {schemaVersion: 1, mode: 'capture', exitCode: -1},
    {schemaVersion: 1, mode: 'capture', exitCode: null},
  ]) {
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result))
    assert.throws(() => consumeRemoteResult(root), /Invalid remote VRT result/)
  }
})

test('remote job preserves a failing subprocess result for the update command', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-bootstrap-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const runner = path.join(root, 'consumer.mjs')
  fs.writeFileSync(runner, `import fs from 'node:fs';
    fs.writeFileSync(process.env.TEST_UNDECLARED_OUTPUTS_DIR + '/junit.xml', '<failure/>');
    process.exitCode = 7;`)
  const output = path.join(root, 'output')
  const node = fs.realpathSync(process.env.JS_BINARY__NODE_BINARY || process.execPath)
  runRemoteJob({runner, env: {VRT_TIMEOUT_MS: TEST_VRT_TIMEOUT_MS}, args: [], output, mode: 'capture'}, node, {NODE_OPTIONS: ''})
  assert.equal(consumeRemoteResult(output), 7)
  assert.equal(fs.readFileSync(path.join(output, 'artifacts/junit.xml'), 'utf8'), '<failure/>')
})

for (const exitCode of [0, 7]) {
  test(`remote result preserves exit ${exitCode} when the artifact tree is empty`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-empty-artifacts-'))
    t.after(() => fs.rmSync(root, {recursive: true, force: true}))
    const runner = path.join(root, 'consumer.mjs')
    fs.writeFileSync(runner, `process.exitCode = ${exitCode};`)
    const output = path.join(root, 'output')
    const node = fs.realpathSync(process.env.JS_BINARY__NODE_BINARY || process.execPath)
    runRemoteJob({runner, env: {VRT_TIMEOUT_MS: TEST_VRT_TIMEOUT_MS}, args: [], output, mode: 'capture'}, node, {NODE_OPTIONS: ''})
    fs.rmdirSync(path.join(output, 'artifacts'))
    assert.equal(consumeRemoteResult(output), exitCode)
    assert.equal(fs.existsSync(path.join(output, 'artifacts')), false)
  })
}

test('native browser failure exits the test process and preserves standard artifacts', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-test-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const runner = path.join(root, 'fail.mjs')
  fs.writeFileSync(runner, `import fs from 'node:fs';
    fs.writeFileSync(process.env.XML_OUTPUT_FILE, '<failure/>');
    process.exitCode = 7;`)
  const job = {runner, env: {VRT_TIMEOUT_MS: TEST_VRT_TIMEOUT_MS}, args: [], output: root, mode: 'test'}
  const node = fs.realpathSync(process.env.JS_BINARY__NODE_BINARY || process.execPath)
  const result = spawnSync(node, ['--input-type=module', '-e',
    `import {runRemoteJob} from ${JSON.stringify(new URL('./remote-job.js', import.meta.url).href)};
     runRemoteJob(${JSON.stringify(job)}, ${JSON.stringify(node)}, {NODE_OPTIONS: ''});`,
  ], {env: {...process.env, NODE_OPTIONS: '', XML_OUTPUT_FILE: path.join(root, 'test.xml')}, encoding: 'utf8'})
  assert.equal(result.status, 7, result.stderr)
  assert.equal(fs.existsSync(path.join(root, 'result.json')), false)
  assert.equal(fs.readFileSync(path.join(root, 'test.xml'), 'utf8'), '<failure/>')
})
