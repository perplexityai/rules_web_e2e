import assert from 'node:assert/strict'
import {test} from 'node:test'
import {testArguments} from './arguments.js'

test('E2E selection preserves regex values and rejects execution-policy overrides', () => {
  const selectors = ['--grep', 'edit|load', '--project=chromium', '--shard=1/2']
  assert.deepEqual(testArguments(false, selectors), selectors)
  assert.deepEqual(testArguments(false, ['--export-snapshots', ...selectors]), selectors)
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
  assert.throws(() => testArguments(true, ['--export-snapshots']))
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
  assert.equal(
    new RegExp(args[0]).test('/staged/_main/app/[route].spec.ts'),
    true
  )
  assert.equal(new RegExp(args[0]).test('/staged/_main/app/r.spec.js'), false)
  assert.equal(args[1], '--pass-with-no-tests')
  assert.throws(() =>
    testArguments(false, ['other.spec.ts'], ['_main/app/test.spec.js'])
  )
  assert.throws(() => testArguments(true, ['--pass-with-no-tests']))
})

test('Bazel selects the Playwright shard and filter without conflicting CLI policies', () => {
  assert.deepEqual(testArguments(false, [], [], {
    TEST_TOTAL_SHARDS: '3', TEST_SHARD_INDEX: '1', TESTBRIDGE_TEST_ONLY: 'checkout.*',
  }), ['--grep', 'checkout.*', '--shard=2/3'])
  assert.deepEqual(testArguments(true, [], [], {
    TEST_TOTAL_SHARDS: '2', TEST_SHARD_INDEX: '0',
  }), ['--shard=1/2'])
  for (const env of [
    {TEST_TOTAL_SHARDS: '0', TEST_SHARD_INDEX: '0'},
    {TEST_TOTAL_SHARDS: '2', TEST_SHARD_INDEX: '2'},
    {TEST_TOTAL_SHARDS: '2'},
  ]) assert.throws(() => testArguments(false, [], [], env), /Invalid Bazel/)
  assert.throws(() => testArguments(false, ['--shard=1/2'], [], {
    TEST_TOTAL_SHARDS: '2', TEST_SHARD_INDEX: '0',
  }), /Bazel owns/)
  assert.throws(() => testArguments(false, ['--grep=a'], [], {TESTBRIDGE_TEST_ONLY: 'b'}), /either/)
  assert.throws(() => testArguments(true, ['--update'], [], {TESTBRIDGE_TEST_ONLY: 'a'}), /updates cannot/)
})
