import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {bazel, outputFiles, run, text} from './harness.ts'

// Run directly under the real supervisor; inspect its VM disk, not fake argv.
const work = path.resolve(process.argv[2])
const parent = process.ppid
const children = text(`/proc/${parent}/task/${parent}/children`).trim().split(/\s+/)
const roots = children.flatMap(child => {
  let args: string[]
  try { args = text(`/proc/${child}/cmdline`).split('\0') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  return args.includes('serve-vm') ? args.filter(arg => arg.startsWith('--root=')).map(arg => arg.slice(7)) : []
})
assert.equal(roots.length, 1, `Expected one supervisor-owned VM: ${roots}`)
assert.equal(fs.statSync(path.join(roots[0], 'cas.ext4')).size, 8192 * 1024 * 1024)
assert(process.env.RULES_WEB_E2E_BAZELRC)
run([bazel, `--output_base=${work}/public-bazel-output`, `--bazelrc=${process.env.RULES_WEB_E2E_BAZELRC}`,
  'test', '//:actiond_capacity_test', '--config=web-e2e', '--remote_accept_cached=false',
  '--nocache_test_results', '--test_output=errors'], {cwd: `${work}/public`, timeout: 180_000})
assert(outputFiles(`${work}/public/bazel-testlogs/actiond_capacity_test/test.outputs`)
  .some(file => file.name.endsWith('.png') && file.read().length > 0))
console.log('8192 MiB guest memory, 8192 MiB CAS image, and browser screenshot verified')
