import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {PassThrough} from 'node:stream'
import {test} from 'node:test'
import {forwardOutput} from './output.js'

test('filters both child streams across chunks and flushes final lines', async () => {
  const child = spawn(process.execPath, ['-e', `
    process.stdout.write('request failed\\nCo');
    process.stderr.write('Auth');
    setTimeout(() => {
      process.stdout.write('okie: session=private-cookie\\nuseful output');
      process.stderr.write('orization: Bearer private-token\\nuseful error');
    }, 10);
  `], {stdio: ['ignore', 'pipe', 'pipe']})
  const output = new PassThrough()
  let captured = ''
  output.on('data', chunk => { captured += chunk.toString() })
  forwardOutput(child.stdout, output)
  forwardOutput(child.stderr, output)
  await once(child, 'close')
  assert.match(captured, /request failed/)
  assert.match(captured, /useful output/)
  assert.match(captured, /useful error/)
  assert.doesNotMatch(captured, /private-cookie|private-token/)
})
