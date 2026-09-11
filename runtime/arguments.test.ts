import assert from 'node:assert/strict'
import {test} from 'node:test'
import {testArguments} from './arguments.js'

test('E2E selection preserves regex values and rejects execution-policy overrides', () => {
  const selectors = ['--grep', 'edit|load', '--project=chromium', '--shard=1/2']
  assert.deepEqual(testArguments(false, selectors), selectors)
  for (const args of [
    ['--config=/host/config.ts'],
    ['--output=/host'],
    ['--update'],
    ['--update-snapshots'],
    ['--grep'],
    ['--grep='],
    ['--grep', '--project=x'],
  ])
    assert.throws(() => testArguments(false, args))
})

test('visual updates cannot silently select only part of the baseline set', () => {
  assert.deepEqual(testArguments(true, ['--update']), [])
  assert.throws(() => testArguments(true, ['--update', '--grep=only-one']))
})

test('CI file selection maps source names to declared compiled specs only', () => {
  const args = testArguments(
    false,
    ['app/[route].spec.ts', '--pass-with-no-tests'],
    ['_main/app/[route].spec.js']
  )
  assert.equal(
    new RegExp(args[0]).test('/staged/_main/app/[route].spec.js'),
    true
  )
  assert.equal(new RegExp(args[0]).test('/staged/_main/app/r.spec.js'), false)
  assert.equal(args[1], '--pass-with-no-tests')
  assert.throws(() =>
    testArguments(false, ['other.spec.ts'], ['_main/app/test.spec.js'])
  )
  assert.throws(() => testArguments(true, ['--pass-with-no-tests']))
})
