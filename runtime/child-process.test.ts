import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {test} from 'node:test'
import {manageChild} from './child-process.js'

for (const detached of [false, true]) {
  test(`drains output after exit with a lingering descendant (detached=${detached})`, {timeout: 10_000}, async context => {
    const child = spawn(process.execPath, ['-e', `
      const descendant = require('node:child_process').spawn(process.execPath, ['-e', \`
        process.on('SIGTERM', () => {});
        setInterval(() => {}, 1000);
        process.send('ready');
      \`], {detached: ${detached}, stdio: ['ignore', 1, 2, 'ipc']});
      descendant.once('message', () => {
        process.stdout.write(String(descendant.pid));
        descendant.disconnect();
        descendant.unref();
        process.exitCode = 7;
      });
    `], {detached: true, stdio: ['ignore', 'pipe', 'pipe']})
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    context.after(() => {
      for (const pid of [-child.pid!, Number(output)]) {
        if (pid) { try { process.kill(pid, 'SIGKILL') } catch {} }
      }
    })
    const managed = manageChild(child)
    assert.equal(await managed.closed, 7)
    assert.match(output, /^\d+$/)
  })
}

test('stop escalates when a live process ignores SIGTERM', {timeout: 10_000}, async context => {
  const child = spawn(process.execPath, ['-e', `
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
    process.send('ready');
  `], {detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc']})
  context.after(() => { try { process.kill(-child.pid!, 'SIGKILL') } catch {} })
  const managed = manageChild(child)
  await once(child, 'message')
  managed.stop()
  managed.stop()
  assert.equal(await managed.closed, null)
  assert.equal(child.signalCode, 'SIGKILL')
})
