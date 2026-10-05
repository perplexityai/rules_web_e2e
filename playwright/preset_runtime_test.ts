import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {test} from 'node:test'

const runtime = path.resolve(process.argv[2])
const manifest = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
test('assembled preset binaries execute with only declared libraries', () => {
  for (const [binary, expected] of [['bin/node', 'v' + manifest.node.version], ['chromium/chrome-headless-shell', manifest.chromium.version]]) {
    const output = execFileSync(path.join(runtime, 'lib/ld-linux-x86-64.so.2'),
      ['--library-path', path.join(runtime, 'lib'), path.join(runtime, binary), '--version'],
      {env: {PATH: '', LANG: 'C'}, encoding: 'utf8'})
    assert(output.split(/\s+/).includes(expected), output)
  }
})
