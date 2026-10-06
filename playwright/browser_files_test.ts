import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test, type TestContext} from 'node:test'
import {copyLayout, layout, validateLinux} from './browser_files.js'
function assemble(manifest: unknown, output: string) {
  copyLayout(layout(manifest), output)
}
function temp(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-files-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  return root
}
function write(file: string, contents: string | Buffer) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, contents) }
function bundle(root: string) {
  write(path.join(root, 'chrome-headless-shell'), 'browser'); fs.chmodSync(path.join(root, 'chrome-headless-shell'), 0o755)
  write(path.join(root, 'icudtl.dat'), 'resources'); return root
}
test('Linux layout copies a relative tree input into the output root', t => {
  const root = temp(t), source = path.join(root, 'system'), output = path.relative(process.cwd(), path.join(root, 'runtime'))
  write(path.join(source, 'lib/loader'), 'loader')
  fs.chmodSync(path.join(source, 'lib/loader'), 0o555)
  fs.chmodSync(path.join(source, 'lib'), 0o555)
  fs.chmodSync(source, 0o555)
  fs.symlinkSync(source, path.join(root, 'declared-system'))
  write(path.join(root, 'node'), 'node')
  copyLayout({files: [
    {source: path.relative(process.cwd(), path.join(root, 'declared-system')), destination: ''},
    {source: path.join(root, 'node'), destination: 'lib/node'},
  ], executables: ['lib/node']}, output)
  assert.equal(fs.statSync(source).mode & 0o777, 0o555)
  assert.equal(fs.statSync(path.join(source, 'lib')).mode & 0o777, 0o555)
  assert.equal(fs.readFileSync(path.join(output, 'lib/node'), 'utf8'), 'node')
  assert.equal(fs.statSync(path.join(output, 'lib/node')).mode & 0o777, 0o755)
  fs.chmodSync(source, 0o755); fs.chmodSync(path.join(source, 'lib'), 0o755)
  fs.rmSync(source, {recursive: true})
  assert.equal(fs.readFileSync(path.join(output, 'lib/loader'), 'utf8'), 'loader')
})
test('FFmpeg cache is relocatable and never chmods declared inputs', t => {
  const root = temp(t), core = path.join(root, 'core'), runtime = path.join(root, 'runtime')
  write(path.join(core, 'browsers.json'), JSON.stringify({browsers: [{name: 'ffmpeg', revision: '1011'}]}))
  fs.mkdirSync(runtime); write(path.join(root, 'declared-helper'), 'helper')
  fs.chmodSync(path.join(root, 'declared-helper'), 0o555)
  fs.symlinkSync(path.join(root, 'declared-helper'), path.join(runtime, 'helper'))
  assemble({mode: 'ffmpeg-cache', core, runtime, ffmpeg: 'helper'}, path.join(root, 'cache'))
  fs.renameSync(path.join(root, 'cache'), path.join(root, 'moved'))
  assert.equal(fs.statSync(path.join(root, 'declared-helper')).mode & 0o777, 0o555)
  fs.unlinkSync(path.join(root, 'declared-helper'))
  const helper = path.join(root, 'moved/ffmpeg-1011/ffmpeg-linux')
  assert.equal(fs.readFileSync(helper, 'utf8'), 'helper')
  assert(!fs.lstatSync(helper).isSymbolicLink()); assert.equal(fs.statSync(helper).mode & 0o777, 0o755)
})
test('FFmpeg cache rejects ambiguous metadata and escaping paths', t => {
  const root = temp(t), core = path.join(root, 'core')
  for (const browsers of [[], [{name: 'ffmpeg', revision: '../outside'}], [{name: 'ffmpeg', revision: '1', revisionOverrides: {}}]]) {
    write(path.join(core, 'browsers.json'), JSON.stringify({browsers}))
    assert.throws(() => assemble({mode: 'ffmpeg-cache', core}, path.join(root, 'cache')), /platform-independent/)
  }
  write(path.join(core, 'browsers.json'), JSON.stringify({browsers: [{name: 'ffmpeg', revision: '1'}]}))
  for (const ffmpeg of ['../outside', '/outside', 'bin/../helper', ''])
    assert.throws(() => assemble({mode: 'ffmpeg-cache', core, runtime: root, ffmpeg}, path.join(root, 'cache')), /relative/)
})
test('installation uses selected Playwright revisions on all supported platforms', t => {
  const root = temp(t), core = path.join(root, 'core'), chromium = [{source: bundle(path.join(root, 'browser')), destination: ''}]
  write(path.join(core, 'browsers.json'), JSON.stringify({browsers: [{name: 'chromium-headless-shell', revision: '4321'}, {name: 'ffmpeg', revision: '7654'}]}))
  for (const platform of ['linux64', 'mac-x64', 'mac-arm64']) {
    const helper = platform === 'linux64' ? 'ffmpeg-linux' : 'ffmpeg-mac'
    write(path.join(root, helper), 'helper')
    const output = path.join(root, platform)
    assemble({mode: 'installation', core, platform, chromium, chromiumExecutable: path.join(chromium[0].source, 'chrome-headless-shell'), ffmpeg: path.join(root, helper)}, output)
    const browser = path.join(output, 'chromium_headless_shell-4321/chrome-headless-shell-' + platform)
    assert.equal(fs.readFileSync(path.join(browser, 'chrome-headless-shell'), 'utf8'), 'browser')
    assert.equal(fs.readFileSync(path.join(browser, 'icudtl.dat'), 'utf8'), 'resources')
    assert.equal(fs.statSync(path.join(browser, 'chrome-headless-shell')).mode & 0o777, 0o755)
    assert.equal(fs.readFileSync(path.join(output, 'ffmpeg-7654', helper), 'utf8'), 'helper')
  }
})
test('Linux validation accepts both architectures and rejects mixed binaries and invalid presets', t => {
  const root = temp(t)
  for (const [arch, loader, machine] of [['x64', 'ld-linux-x86-64.so.2', 62], ['arm64', 'ld-linux-aarch64.so.1', 183]] as const) {
    const base = path.join(root, arch), system = path.join(base, 'system'), node = path.join(base, 'node')
    const binary = Buffer.alloc(64); binary.set([127, 69, 76, 70, 2, 1]); binary.writeUInt16LE(machine, 18)
    for (const name of ['lib/' + loader, 'bin/bash', 'etc/fonts/fonts.conf', 'fonts/default.ttf']) write(path.join(system, name), binary)
    const loaderInput = path.join(base, 'declared-loader')
    fs.renameSync(path.join(system, 'lib', loader), loaderInput)
    fs.symlinkSync(loaderInput, path.join(system, 'lib', loader))
    write(node, binary)
    const browser = bundle(path.join(base, 'browser')); write(path.join(browser, 'chrome-headless-shell'), binary)
    const ffmpeg = path.join(base, 'ffmpeg-linux'); write(ffmpeg, binary)
    const manifest = {arch, system, node, chromium: path.join(browser, 'chrome-headless-shell'), ffmpeg}
    validateLinux(manifest)
    validateLinux({...manifest, ffmpeg: ''})
    const wrong = Buffer.from(binary); wrong.writeUInt16LE(machine === 62 ? 183 : 62, 18); write(node, wrong)
    assert.throws(() => validateLinux(manifest), /node must be a Linux/)
    write(node, binary); fs.unlinkSync(path.join(system, 'lib', loader))
    assert.throws(() => validateLinux(manifest), /system preset is missing/)
    write(path.join(system, 'bin/node'), 'unexpected')
    assert.throws(() => validateLinux(manifest), /must not contain/)
  }
})
