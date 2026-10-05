import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync, spawn} from 'node:child_process'
import {test, type TestContext} from 'node:test'
import {setTimeout as sleep} from 'node:timers/promises'
import {runfiles} from '@bazel/runfiles'
import {unzipSync} from 'fflate'
const files = Object.fromEntries(process.argv.slice(2).flatMap(arg => arg.split(' ')).map(p => [path.basename(p), runfiles.resolve(p)]))
function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  const env = {...process.env, PATH: '', MAGIC: files['magic.mgc'], LC_ALL: 'C'}
  const run = (command: string, ...args: string[]) => execFileSync('/bin/bash', ['-c', 'source "$1"; shift; "$@"', 'tools', files['tools.bash-env'], command, ...args], {cwd: root, env, encoding: 'utf8'})
  return {root, env, run}
}
test('test wrapper utilities produce file metadata with an empty PATH', t => {
  const {root, run} = fixture(t)
  run('mkdir', '-p', 'outputs/nested'); run('touch', 'outputs/nested/result.txt')
  fs.writeFileSync(path.join(root, 'outputs/nested/result.txt'), 'test result\n')
  run('ln', '-s', 'nested/result.txt', 'outputs/link')
  assert.equal(run('dirname', 'outputs/nested/result.txt').trim(), 'outputs/nested')
  assert.equal(run('cat', 'outputs/link'), 'test result\n')
  assert.equal(run('stat', '-c%s', 'outputs/nested/result.txt').trim(), '12')
  assert.equal(run('file', '-L', '-b', '--mime-type', 'outputs/link').trim(), 'text/plain')
  fs.writeFileSync(path.join(root, 'unsorted'), run('find', '-L', 'outputs', '-type', 'f'))
  assert.deepEqual(run('sort', 'unsorted').trim().split('\n'), ['outputs/link', 'outputs/nested/result.txt'])
  run('rm', '-r', 'outputs'); assert(!fs.existsSync(path.join(root, 'outputs')))
})
test('manifest and signal parsing retain paths containing spaces', t => {
  const {root, run} = fixture(t)
  fs.writeFileSync(path.join(root, 'MANIFEST'), 'workspace/test /some path/test\nother /unrelated\n')
  fs.writeFileSync(path.join(root, 'matched'), run('grep', '^workspace/test ', 'MANIFEST'))
  assert.equal(run('sed', 's/[^ ]* //', 'matched'), '/some path/test\n')
  fs.writeFileSync(path.join(root, 'signals'), '1) SIGHUP 2) SIGINT\n')
  assert.equal(run('sed', '-E', 's/[0-9]+\\)//g', 'signals'), ' SIGHUP  SIGINT\n')
  assert.match(run('date', '+%s').trim(), /^\d+$/); assert(run('date', '+%F %T %Z').trim())
})
test('process monitoring tracks remaining descendants after their group leader exits', async t => {
  const {root, run} = fixture(t)
  // The child inherits the detached leader's group; no host process is targeted.
  const marker = path.join(root, 'child.pid')
  const leader = spawn(process.execPath, ['-e', `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const p=spawn(${JSON.stringify(files.toybox)},['sleep','60'],{stdio:'ignore'}); fs.writeFileSync(${JSON.stringify(marker)},String(p.pid)); p.unref(); setInterval(()=>{},1000)`], {detached: true, stdio: 'ignore'})
  t.after(() => { try { process.kill(-leader.pid!, 'SIGKILL') } catch {} })
  for (let i = 0; !fs.existsSync(marker) && i < 100; i++) await sleep(20)
  const child = fs.readFileSync(marker, 'utf8'), group = String(leader.pid)
  assert(run('ps', '-p', group, '-o', 'PID=').split(/\s+/).includes(group))
  assert(run('ps', '-g', String(process.getgid!()), '-o', 'PID=').split(/\s+/).includes(group))
  assert.deepEqual(new Set(run('pgrep', '-a', '-g', group).trim().split(/\s+/)), new Set([group, child]))
  leader.kill('SIGTERM'); await new Promise(resolve => leader.once('exit', resolve))
  assert.equal(run('pgrep', '-a', '-g', group).trim(), child)
  process.kill(Number(child), 'SIGTERM')
  for (let i = 0; i < 100; i++) {
    try { run('pgrep', '-a', '-g', group) } catch (error) {
      assert.equal((error as any).status, 1); assert.equal((error as any).stdout, ''); return
    }
    await sleep(20)
  }
  assert.fail('process group remained live')
})
test('screenshot MIME detection and ZIP preserve files, hidden annotations and linked content', t => {
  const {root, run} = fixture(t)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=', 'base64')
  fs.writeFileSync(path.join(root, 'screenshot.png'), png); fs.writeFileSync(path.join(root, '.annotation'), 'result')
  run('ln', '-s', 'screenshot.png', 'linked.png')
  assert.equal(run('file', '-L', '-b', '--mime-type', 'screenshot.png').trim(), 'image/png')
  run('zip', '-qr', 'outputs.zip', '--', 'screenshot.png', 'linked.png', '.annotation')
  const archive = unzipSync(fs.readFileSync(path.join(root, 'outputs.zip')))
  assert.deepEqual(Object.keys(archive).sort(), ['.annotation', 'linked.png', 'screenshot.png'])
  assert.deepEqual(Buffer.from(archive['linked.png']), png)
  assert.equal(Buffer.from(archive['.annotation']).toString(), 'result')
})
