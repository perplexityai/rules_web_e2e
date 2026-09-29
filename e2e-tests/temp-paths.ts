import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {consumerTest, json, nonempty, run} from './harness.ts'

consumerTest((work, consumer, command) => {
  const deep = path.join(work, 'nested-'.repeat(24))
  fs.mkdirSync(deep)
  const alias = path.join(work, 's')
  fs.symlinkSync(deep, alias, 'dir')
  assert(Buffer.byteLength(alias) < 40)
  run([...command, 'test', '//:host_temp_path_test', `--test_tmpdir=${deep}`,
    '--nocache_test_results', '--test_output=errors'], {cwd: consumer, timeout: 300_000})
  // Bazel expands test_tmpdir. Also invoke its built launcher with a short alias.
  const output = path.join(work, 'symlink-artifacts')
  fs.mkdirSync(output)
  run([`${consumer}/bazel-bin/host_temp_path_test_/host_temp_path_test`], {
    cwd: consumer, timeout: 90_000,
    env: {...process.env, BAZEL_BINDIR: '.', TEST_TMPDIR: alias,
      TEST_UNDECLARED_OUTPUTS_DIR: output, XML_OUTPUT_FILE: `${output}/test.xml`},
  })
  nonempty(`${output}/browser.png`)
  const staging = path.dirname(json(`${output}/temp.json`))
  assert(!fs.existsSync(staging), `Successful runner leaked ${staging}`)
})
