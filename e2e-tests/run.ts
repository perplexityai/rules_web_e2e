import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {consumerTest, copyConsumer, files, run, text} from './harness.ts'

const mode = process.argv[2] || 'host'
if (mode === 'host') {
  consumerTest((_work, consumer, command) => {
    run([...command, 'test', '//:host_package_test', '//:host_component_test', '//:host_native_config_test',
      '--nocache_test_results', '--test_output=errors'], {cwd: consumer})
    const failure = run([...command, 'test', '//:host_missing_package_test',
      '--nocache_test_results', '--test_output=errors'], {cwd: consumer, fail: true, stdio: 'pipe'})
    assert.match(failure, /Cannot find module 'required-but-undeclared-package'/)
    run([...command, 'test', '//:host_snapshot_export_test', '--test_arg=--export-snapshots',
      '--nocache_test_results'], {cwd: consumer})
    const snapshots = files(path.join(consumer, 'bazel-testlogs/host_snapshot_export_test/test.outputs/snapshots'))
    assert.equal(snapshots.length, 1)
    assert.equal(path.basename(snapshots[0]), `page-${process.platform}.png`)
    assert.equal(fs.readFileSync(snapshots[0]).subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    const sources = JSON.parse(text(path.join(consumer, 'bazel-testlogs/host_snapshot_export_test/test.outputs/snapshot-sources.json')))
    assert.equal(sources['snapshot-export.spec.js'], '_main/snapshot-export.spec.js')
    assert(!fs.existsSync(path.join(consumer, 'snapshot-export.spec.ts-snapshots')))
    const missing = run([...command, 'test', '//:host_snapshot_export_test', '--nocache_test_results',
      '--test_output=errors'], {cwd: consumer, fail: true, stdio: 'pipe'})
    assert.match(missing, /snapshot doesn't exist|snapshot.*missing/i)
  })
} else if (mode === 'prepare') {
  const work = path.resolve(process.argv[3])
  const consumer = path.join(work, 'public')
  const arch = process.env.ACTIOND_ARCH || 'x64'
  assert(['x64', 'arm64'].includes(arch), 'ACTIOND_ARCH must be x64 or arm64')
  copyConsumer(consumer)
  const build = path.join(consumer, 'BUILD.bazel')
  fs.writeFileSync(build, text(build).replace('_TARGET_ARCH = "x64"', `_TARGET_ARCH = ${JSON.stringify(arch)}`))
  fs.copyFileSync(path.join(work, 'runtime.tar'), path.join(consumer, 'runtime.tar'))
} else {
  throw new Error(`Unknown mode: ${mode}; use host or prepare`)
}
