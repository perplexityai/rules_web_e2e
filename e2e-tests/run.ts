import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {consumerTest, copyConsumer, repository, run, text} from './harness.ts'

const mode = process.argv[2] || 'host'
if (mode === 'host') {
  consumerTest((_work, consumer, command) => {
    run([...command, 'test', '//:host_package_test', '//:host_component_test', '//:host_native_config_test',
      '--nocache_test_results', '--test_output=errors'], {cwd: consumer})
    const failure = run([...command, 'test', '//:host_missing_package_test',
      '--nocache_test_results', '--test_output=errors'], {cwd: consumer, fail: true, stdio: 'pipe'})
    assert.match(failure, /Cannot find module 'required-but-undeclared-package'/)
  })
} else if (mode === 'local') {
  const work = path.resolve(process.argv[3])
  const consumer = path.join(work, 'public')
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  assert.equal(process.platform, 'linux')
  assert(['x64', 'arm64'].includes(process.arch))
  copyConsumer(consumer)
  const build = path.join(consumer, 'BUILD.bazel')
  fs.writeFileSync(build, text(build)
    .replace('_TARGET_ARCH = "x64"', '_TARGET_ARCH = "' + arch + '"')
    .replace('_EXECUTION = "actiond"', '_EXECUTION = "local"')
    .replace('browser_runtime_archive(name = "actiond_runtime_files", archive = "runtime.tar")',
      'alias(name = "actiond_runtime_files", actual = "@local_runtime//:browser' + (arch === 'arm64' ? '_arm64' : '') + '")'))

  const module = path.join(consumer, 'MODULE.bazel')
  fs.appendFileSync(module, '\nbazel_dep(name = "browser_runtime_example", version = "0.0.0", repo_name = "local_runtime")\nlocal_path_override(module_name = "browser_runtime_example", path = ' + JSON.stringify(path.join(repository, 'examples/browser-runtime')) + ')\n')
  if (arch === 'arm64') fs.writeFileSync(module, text(module)
    .replace('/ffmpeg-linux.zip', '/ffmpeg-linux-arm64.zip')
    .replace('ebc74fc5b94830176a3c2914ae96bd8bc7f6a91f4f33890230f84a172ee61ccc', '2628c03f05318ff812c8c9baaf207dea2ddf53e818c0dc936714b0fbe3afb009'))
  run([process.execPath, path.join(repository, 'e2e-tests/vm.ts'), work, 'local'], {env: {...process.env, ACTIOND_ARCH: arch}, timeout: 1_800_000})
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
  throw new Error(`Unknown mode: ${mode}; use host, local, or prepare`)
}
