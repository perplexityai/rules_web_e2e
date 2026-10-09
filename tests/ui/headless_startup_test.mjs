import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import path from 'node:path'

const child = spawn(path.resolve(process.env.UI_LAUNCHER), [], {
  env: {...process.env, DISPLAY: '', WAYLAND_DISPLAY: '', PWTEST_UNDER_TEST: ''},
  stdio: ['pipe', 'pipe', 'pipe'],
})
let output = ''
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(output || 'UI startup timed out')), 20000)
    const read = chunk => {
      output += chunk
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/)
      if (match) { clearTimeout(timer); resolve(match[0]) }
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`UI exited ${code}: ${output}`)) })
  })
  const response = await fetch(url)
  assert.equal(response.status, 200)
  assert.match(await response.text(), /Playwright/)
  assert.equal(child.exitCode, null)
} finally {
  child.kill('SIGINT')
}
