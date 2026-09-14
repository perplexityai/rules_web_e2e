import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {spawnSync} from 'node:child_process'
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
  runRemoteJob({runfiles: {}, runner, env: {}, args: [], output, mode: 'compare'}, node, {NODE_OPTIONS: ''})
  const artifacts = path.join(root, 'test-artifacts')
  assert.equal(consumeRemoteResult(output, {artifacts, mode: 'compare'}), 7)
  assert.equal(fs.readFileSync(path.join(artifacts, 'junit.xml'), 'utf8'), '<failure/>')
})

test('native browser failure exits the test process and preserves standard artifacts', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-test-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const runner = path.join(root, 'fail.mjs')
  fs.writeFileSync(runner, `import fs from 'node:fs';
    fs.writeFileSync(process.env.TEST_UNDECLARED_OUTPUTS_DIR + '/junit.xml', '<failure/>');
    process.exitCode = 7;`)
  const job = {runfiles: {}, runner, env: {}, args: [], output: root, mode: 'test'}
  const node = fs.realpathSync(process.env.JS_BINARY__NODE_BINARY || process.execPath)
  const result = spawnSync(node, ['--input-type=module', '-e',
    `import {runRemoteJob} from ${JSON.stringify(new URL('./remote-job.js', import.meta.url).href)};
     runRemoteJob(${JSON.stringify(job)}, ${JSON.stringify(node)}, {NODE_OPTIONS: ''});`,
  ], {env: {...process.env, NODE_OPTIONS: '', XML_OUTPUT_FILE: path.join(root, 'test.xml')}, encoding: 'utf8'})
  assert.equal(result.status, 7, result.stderr)
  assert.equal(fs.readFileSync(path.join(root, 'junit.xml'), 'utf8'), '<failure/>')
  assert.equal(fs.existsSync(path.join(root, 'result.json')), false)
  assert.equal(fs.readFileSync(path.join(root, 'test.xml'), 'utf8'), '<failure/>')
})

for (const exitCode of [0, 7]) {
  test(`local result wrapper preserves per-case JUnit with exit ${exitCode}`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-junit-'))
    t.after(() => fs.rmSync(root, {recursive: true, force: true}))
    const result = path.join(root, 'result')
    fs.mkdirSync(path.join(result, 'artifacts'), {recursive: true})
    const xml = '<testsuite tests="1"><testcase name="Button / default"/></testsuite>'
    fs.writeFileSync(path.join(result, 'artifacts/junit.xml'), xml)
    fs.writeFileSync(path.join(result, 'result.json'), JSON.stringify({schemaVersion: 1, mode: 'compare', exitCode}))
    const xmlOutput = path.join(root, 'test.xml')
    const child = spawnSync(process.execPath, [new URL('./remote-result-entry.js', import.meta.url).pathname], {
      env: {...process.env, RUNFILES_DIR: root, VRT_RESULT: 'result', VRT_APPLY_BASELINES: '', VRT_RESULT_MODE: '', XML_OUTPUT_FILE: xmlOutput, TEST_UNDECLARED_OUTPUTS_DIR: path.join(root, 'outputs')},
      encoding: 'utf8',
    })
    assert.equal(child.status, exitCode, child.stderr)
    assert.equal(fs.readFileSync(xmlOutput, 'utf8'), xml)
    assert.equal(fs.readFileSync(path.join(root, 'outputs/junit.xml'), 'utf8'), xml)
  })
}
