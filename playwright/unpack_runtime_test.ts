import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test, type TestContext} from 'node:test'
import {gzipSync} from 'node:zlib'
import {Header} from 'tar'
import {assemble} from './unpack_runtime.js'

function temp(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unpack-test-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  return root
}
type Entry = [string, string, ('file' | 'link' | 'hardlink' | 'executable' | 'fifo')?]
function archive(root: string, entries: Entry[], compressed = false) {
  const chunks: Buffer[] = []
  for (const [name, content, kind] of entries) {
    const link = kind === 'link' || kind === 'hardlink'
    const data = link || kind === 'fifo' ? Buffer.alloc(0) : Buffer.from(content)
    const header = new Header({path: name, size: data.length, mode: kind === 'executable' ? 0o755 : 0o644,
      type: kind === 'link' ? 'SymbolicLink' : kind === 'hardlink' ? 'Link' : kind === 'fifo' ? 'FIFO' : 'File', linkpath: link ? content : ''})
    header.encode()
    chunks.push(Buffer.from(header.block!), data, Buffer.alloc((512 - data.length % 512) % 512))
  }
  chunks.push(Buffer.alloc(1024))
  const target = path.join(root, `archive-${fs.readdirSync(root).length}.tar`)
  fs.writeFileSync(target, compressed ? gzipSync(Buffer.concat(chunks)) : Buffer.concat(chunks))
  return target
}
test('materializes archive-root links and executable modes, including gzip', t => {
  const root = temp(t)
  for (const compressed of [false, true]) {
    const source = archive(root, [['usr/bin/node', 'node', 'executable'], ['usr/lib/loader', 'loader', 'file'],
      ['bin', '/usr/bin', 'link'], ['lib64/loader', '/usr/lib/loader', 'link'], ['hard', '/usr/lib/loader', 'hardlink']], compressed)
    const output = path.join(root, String(compressed))
    assemble({archives: [source]}, output)
    assert.equal(fs.readFileSync(path.join(output, 'bin/node'), 'utf8'), 'node')
    assert.equal(fs.readFileSync(path.join(output, 'lib64/loader'), 'utf8'), 'loader')
    assert.equal(fs.readFileSync(path.join(output, 'hard'), 'utf8'), 'loader')
    assert.equal(fs.statSync(path.join(output, 'bin/node')).mode & 0o777, 0o755)
    assert(!fs.lstatSync(path.join(output, 'bin')).isSymbolicLink())
  }
})
test('rejects traversal, dangling links, cycles, devices and overlay whiteouts', t => {
  const root = temp(t)
  for (const entry of [['../escape', 'bad', 'file'], ['/escape', 'bad', 'file'], ['link', '../../escape', 'link'],
    ['missing', '/not-in-image', 'link'], ['loop', '/', 'link'], ['usr/.wh.removed', '', 'file'], ['pipe', '', 'fifo']] as Entry[]) {
    const source = archive(root, [entry])
    assert.throws(() => assemble({archives: [source]}, path.join(root, 'output')))
    fs.rmSync(path.join(root, 'output'), {recursive: true, force: true})
  }
})
test('assembles selected cross-archive links and declared files without unrelated cycles', t => {
  const root = temp(t)
  const a = archive(root, [['etc/fonts/alias', '/usr/share/fonts/policy', 'link'], ['unrelated/loop', '/unrelated', 'link']])
  const b = archive(root, [['usr/share/fonts/policy', 'policy', 'file'], ['usr/bin/bash', 'shell', 'executable']])
  const browser = path.join(root, 'browser')
  fs.mkdirSync(browser); fs.writeFileSync(path.join(browser, 'chrome'), 'browser', {mode: 0o755})
  const declared = path.join(root, 'declared-chrome')
  fs.renameSync(path.join(browser, 'chrome'), declared)
  fs.symlinkSync(declared, path.join(browser, 'chrome'))
  const output = path.join(root, 'output')
  assemble({archives: [a, b], paths: {'etc/fonts': 'config', 'usr/bin/bash': 'bin/bash'}, files: {[browser]: 'chromium'}}, output)
  assert.equal(fs.readFileSync(path.join(output, 'config/alias'), 'utf8'), 'policy')
  assert.equal(fs.statSync(path.join(output, 'chromium/chrome')).mode & 0o777, 0o755)
  assert(!fs.lstatSync(path.join(output, 'chromium/chrome')).isSymbolicLink())
  assert(!fs.existsSync(path.join(output, 'unrelated')))
})
test('selection rejects escapes, overlapping destinations, absent entries and cycles', t => {
  const root = temp(t)
  const source = archive(root, [['node', 'binary', 'file'], ['loop', '/', 'link']])
  for (const [paths, files] of [
    [{'../escape': 'safe'}, {}], [{node: '../escape'}, {}], [{node: '/escape'}, {}],
    [{node: 'bin', loop: 'bin/child'}, {}], [{node: 'bin/node'}, {unused: 'bin/node'}],
    [{missing: 'missing'}, {}], [{loop: 'loop'}, {}],
  ] as [Record<string, string>, Record<string, string>][]) {
    assert.throws(() => assemble({archives: [source], paths, files}, path.join(root, 'output')))
  }
})
test('excluded link targets stay absent and additional files cannot overwrite archives', t => {
  const root = temp(t)
  const source = archive(root, [['fonts/keep/font', 'kept', 'file'], ['fonts/remove/font', 'removed', 'file'],
    ['alias', '/fonts/remove/font', 'link']])
  const output = path.join(root, 'output')
  assemble({archives: [source], paths: {fonts: 'fonts'}, exclude: ['fonts/remove']}, output)
  assert.equal(fs.readFileSync(path.join(output, 'fonts/keep/font'), 'utf8'), 'kept')
  assert(!fs.existsSync(path.join(output, 'fonts/remove')))
  assert.throws(() => assemble({archives: [source], paths: {alias: 'alias'}, exclude: ['fonts/remove']}, path.join(root, 'bad')), /dangling/)
  assert.throws(() => assemble({archives: [source], exclude: ['../escape']}, output), /relative/)
  const replacement = path.join(root, 'replacement'); fs.writeFileSync(replacement, 'new')
  assert.throws(() => assemble({archives: [source], paths: {'fonts/keep/font': 'node'}, files: {[replacement]: 'node'}}, output), /Overlapping/)
  const plain = archive(root, [['node', 'old', 'file']])
  assert.throws(() => assemble({archives: [plain], files: {[replacement]: 'node'}}, path.join(root, 'plain')), /overwrite/)
})

test('bzip2 archives retain the same extraction checks', t => {
  const root = temp(t), source = path.join(root, 'fixture.tar.bz2'), output = path.join(root, 'output')
  fs.writeFileSync(source, Buffer.from('QlpoOTFBWSZTWenZGb4AAHh7gsEQACRAAH+AAAhmRJ8AQAAACCAAdQ1PUm0TTTRpoB6nqCSp5NQ0AAAefczd0IKYASMYMMneRdQkgabD9M2ZAtJOeCRbF+Bcg2olBIxvaU0iJwgFN/B2OW9CgKzfQWpIPxdyRThQkOnZGb4=', 'base64'))
  assemble({archives: [source]}, output)
  assert.equal(fs.readFileSync(path.join(output, 'hello'), 'utf8'), 'hello\n')
})
