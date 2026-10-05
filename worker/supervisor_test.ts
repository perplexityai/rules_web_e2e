import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {createHash} from 'node:crypto'
import {test, type TestContext} from 'node:test'
import {setTimeout as sleep} from 'node:timers/promises'
import {bazelConfig, preflight, supervise} from './supervisor.js'
import {cli} from './main.js'
const node = fs.realpathSync(process.env.JS_BINARY__NODE_BINARY || process.execPath)
async function fixture(t: TestContext, mode = 'listen') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-'))
  t.after(() => {
    if (!t.passed && fs.existsSync(path.join(root, 'logs')))
      for (const dir of fs.readdirSync(path.join(root, 'logs'))) console.error(fs.readFileSync(path.join(root, 'logs', dir, 'actiond.log'), 'utf8'))
    fs.rmSync(root, {recursive: true, force: true})
  })
  const server = net.createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as net.AddressInfo).port
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  const worker = path.join(root, 'worker'), record = path.join(root, 'worker.json'), logs = path.join(root, 'logs')
  fs.writeFileSync(worker, `#!${node}
const fs = require('node:fs'), net = require('node:net');
const args = Object.fromEntries(process.argv.slice(3).map(arg => arg.slice(2).split('=')));
fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({pid:process.pid, root:args.root, memory:args['memory-mib'], cas:args['cas-image-size-mib'], env:process.env}));
const mode = ${JSON.stringify(mode)};
if(mode==='exit') process.exit(17);
if(mode==='stall') setInterval(()=>{},1000);
else {
  const server = net.createServer(socket => {
    socket.end();
    if(mode==='die') { const timer = setInterval(()=>{ if(fs.existsSync(${JSON.stringify(path.join(root, 'child.pid'))})) { clearInterval(timer); process.exit(19); } },10); }
  });
  server.listen(Number(args.listen.split(':')[1]),'127.0.0.1');
}
`, {mode: 0o755})
  const cleaned = () => {
    const data = JSON.parse(fs.readFileSync(record, 'utf8'))
    assert(!fs.existsSync(path.dirname(data.root)))
    assert.throws(() => process.kill(data.pid, 0), {code: 'ESRCH'})
    assert(fs.readdirSync(logs).some(dir => fs.existsSync(path.join(logs, dir, 'actiond.log'))))
  }
  return {root, port, worker, record, logs, cleaned}
}
const script = (source: string) => [node, '-e', source]
test('command status, Bazel settings, capacity and private worker environment survive supervision', async t => {
  const f = await fixture(t), output = path.join(f.root, 'command.json')
  process.env.SECRET_FOR_TEST = 'not-for-worker'; t.after(() => { delete process.env.SECRET_FOR_TEST })
  const status = await supervise(f.worker, () => script(`const fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({config:fs.readFileSync(process.env.RULES_WEB_E2E_BAZELRC,'utf8'),endpoint:process.env.RULES_WEB_E2E_ENDPOINT})); process.exit(7)`), f.logs, f.port, 2, 12288, 32768)
  assert.equal(status, 7)
  const result = JSON.parse(fs.readFileSync(output, 'utf8'))
  assert.equal(result.endpoint, `grpc://127.0.0.1:${f.port}`)
  assert(result.config.includes('--remote_executor=' + result.endpoint))
  assert(result.config.includes('--remote_local_fallback=false'))
  assert(!result.config.includes('--remote_default_exec_properties'))
  const record = JSON.parse(fs.readFileSync(f.record, 'utf8'))
  assert.equal(record.env.SECRET_FOR_TEST, undefined)
  assert.equal(record.memory, '12288'); assert.equal(record.cas, '32768'); f.cleaned()
})
test('occupied ports are never adopted', async t => {
  const f = await fixture(t), server = net.createServer()
  await new Promise<void>(resolve => server.listen(f.port, '127.0.0.1', resolve))
  t.after(() => server.close())
  await assert.rejects(supervise(f.worker, () => ['never'], f.logs, f.port, 1), {code: 'EADDRINUSE'})
  assert(!fs.existsSync(f.record))
})
test('recently closed connections do not prevent worker startup', async t => {
  const f = await fixture(t)
  const server = net.createServer(socket => socket.end())
  await new Promise<void>(resolve => server.listen(f.port, '127.0.0.1', resolve))
  await new Promise<void>((resolve, reject) => {
    const client = net.connect(f.port, '127.0.0.1'); client.on('error', reject); client.on('end', resolve)
  })
  await new Promise<void>(resolve => server.close(() => resolve()))
  assert.equal(await supervise(f.worker, () => script('process.exit(23)'), f.logs, f.port, 2), 23)
  f.cleaned()
})
test('startup exit and timeout never launch the command', async t => {
  for (const mode of ['exit', 'stall']) {
    const f = await fixture(t, mode)
    await assert.rejects(supervise(f.worker, () => { assert.fail('command ran before readiness') }, f.logs, f.port, 0.3), /startup/)
    f.cleaned()
  }
})
test('worker death kills the running command', async t => {
  const f = await fixture(t, 'die'), marker = path.join(f.root, 'child.pid')
  await assert.rejects(supervise(f.worker, () => script(`require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid)); setInterval(()=>{},1000)`), f.logs, f.port, 2), /while the command/)
  assert.throws(() => process.kill(Number(fs.readFileSync(marker, 'utf8')), 0), {code: 'ESRCH'})
  f.cleaned()
})
test('cancellation cleans worker and command and reports signal status', async t => {
  const f = await fixture(t), marker = path.join(f.root, 'command.pid')
  const cancellation = (async () => {
    for (let i = 0; !fs.existsSync(marker) && i < 250; i++) await sleep(20)
    assert(fs.existsSync(marker)); process.kill(process.pid, 'SIGTERM')
  })()
  const status = await supervise(f.worker, () => script(`require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid)); setInterval(()=>{},1000)`), f.logs, f.port, 2)
  await cancellation; assert.equal(status, 143)
  assert.throws(() => process.kill(Number(fs.readFileSync(marker, 'utf8')), 0), {code: 'ESRCH'}); f.cleaned()
})
test('CLI resolves runfiles before entering the consumer workspace', async t => {
  const f = await fixture(t), manifest = path.join(f.root, 'manifest.json'), cwd = process.cwd()
  const hash = createHash('sha256').update(fs.readFileSync(f.worker)).digest('hex')
  fs.writeFileSync(manifest, JSON.stringify({sha256: hash, version: 'test'}))
  const originalStat = fs.statSync, originalAccess = fs.accessSync
  t.mock.method(fs, 'statSync', ((file: fs.PathLike, ...args: any[]) => ['/dev/kvm', '/dev/vhost-vsock'].includes(String(file)) ? {isCharacterDevice: () => true} : (originalStat as any)(file, ...args)) as typeof fs.statSync)
  t.mock.method(fs, 'accessSync', (file: fs.PathLike, mode?: number) => {
    if (!['/dev/kvm', '/dev/vhost-vsock'].includes(String(file))) originalAccess(file, mode)
  })
  const prior = process.env.BUILD_WORKSPACE_DIRECTORY
  process.env.BUILD_WORKSPACE_DIRECTORY = f.root
  t.after(() => { process.chdir(cwd); if (prior === undefined) delete process.env.BUILD_WORKSPACE_DIRECTORY; else process.env.BUILD_WORKSPACE_DIRECTORY = prior })
  const status = await cli([`--worker-runfile=${f.worker}`, `--manifest-runfile=${manifest}`, `--port=${f.port}`, `--log-dir=${f.logs}`, 'exec', '--', ...script("require('node:fs').writeFileSync('working-directory',process.cwd())")])
  assert.equal(status, 0); assert.equal(fs.readFileSync(path.join(f.root, 'working-directory'), 'utf8'), f.root); f.cleaned()
})
test('checksum mismatch fails before device checks or execution', async t => {
  const f = await fixture(t)
  assert.throws(() => preflight(f.worker, '0'.repeat(64)), /checksum/)
  assert(!fs.existsSync(f.record))
})
test('Bazel config leaves prerequisite execution properties alone', () => {
  const config = bazelConfig('grpc://127.0.0.1:18980')
  assert(config.includes('--remote_cache=grpc://127.0.0.1:18980'))
  assert(!config.includes('--remote_default_exec_properties'))
})
