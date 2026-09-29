import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {consumerTest, copyConsumer, run, text} from './harness.ts'

const mode = process.argv[2] || 'host'
if (mode === 'host') {
  consumerTest((_work, consumer, command) => {
    run([...command, 'test', '//:host_component_test', '//:host_native_config_test',
      '--nocache_test_results', '--test_output=errors'], {cwd: consumer})
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
