import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test, type TestContext} from 'node:test'
import {execFileSync} from 'node:child_process'
import {layout} from './browser_files.js'
const coreutils = path.resolve(process.argv[2]), copyScript = path.resolve(process.argv[3])
function assemble(manifest: unknown, output: string) {
  const plan = layout(manifest)
  const config = output + '.copy-layout', executables = output + '.executables'
  fs.writeFileSync(config, plan.files.flatMap(({source, destination}) => [source, destination]).map(value => value + '\0').join(''))
  fs.writeFileSync(executables, plan.executables.map(file => file + '\0').join(''))
  execFileSync('bash', [copyScript, coreutils, config, executables, output])
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
  const root = temp(t), core = path.join(root, 'core'), chromium = [bundle(path.join(root, 'browser'))]
  write(path.join(core, 'browsers.json'), JSON.stringify({browsers: [{name: 'chromium-headless-shell', revision: '4321'}, {name: 'ffmpeg', revision: '7654'}]}))
  for (const platform of ['linux64', 'mac-x64', 'mac-arm64']) {
    const helper = platform === 'linux64' ? 'ffmpeg-linux' : 'ffmpeg-mac'
    write(path.join(root, helper), 'helper')
    const output = path.join(root, platform)
    assemble({mode: 'installation', core, platform, chromium, ffmpeg: [path.join(root, helper)]}, output)
    const browser = path.join(output, 'chromium_headless_shell-4321/chrome-headless-shell-' + platform)
    assert.equal(fs.readFileSync(path.join(browser, 'chrome-headless-shell'), 'utf8'), 'browser')
    assert.equal(fs.readFileSync(path.join(browser, 'icudtl.dat'), 'utf8'), 'resources')
    assert.equal(fs.statSync(path.join(browser, 'chrome-headless-shell')).mode & 0o777, 0o755)
    assert.equal(fs.readFileSync(path.join(output, 'ffmpeg-7654', helper), 'utf8'), 'helper')
  }
  assert.throws(() => assemble({mode: 'installation', core, platform: 'linux64', chromium: [...chromium, bundle(path.join(root, 'other'))]}, path.join(root, 'ambiguous')), /exactly one/)
})
test('Linux assembly accepts both architectures and rejects mixed binaries and invalid presets', t => {
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
    const font = path.join(base, 'brand.ttf'); write(font, 'font')
    const manifest = {mode: 'linux', arch, system, node, chromium: [browser], ffmpeg: [ffmpeg], fonts: [font]}
    const output = path.join(base, 'runtime'); assemble(manifest, output)
    assert.deepEqual(fs.readFileSync(path.join(output, 'bin/node')), binary)
    assert(!fs.lstatSync(path.join(output, 'lib', loader)).isSymbolicLink())
    assert.deepEqual(fs.readFileSync(path.join(output, 'bin/ffmpeg-linux')), binary)
    assert.equal(fs.readFileSync(path.join(output, 'fonts/custom/0/brand.ttf'), 'utf8'), 'font')
    assert(fs.existsSync(path.join(output, 'fonts/default.ttf')))
    const withoutVideo = path.join(base, 'without-video')
    assemble({...manifest, ffmpeg: []}, withoutVideo)
    assert(!fs.existsSync(path.join(withoutVideo, 'bin/ffmpeg-linux')))
    const wrong = Buffer.from(binary); wrong.writeUInt16LE(machine === 62 ? 183 : 62, 18); write(node, wrong)
    assert.throws(() => assemble(manifest, path.join(base, 'wrong')), /node must be a Linux/)
    write(node, binary); fs.unlinkSync(path.join(system, 'lib', loader))
    assert.throws(() => assemble(manifest, path.join(base, 'missing')), /system preset is missing/)
    write(path.join(system, 'bin/node'), 'unexpected')
    assert.throws(() => assemble(manifest, path.join(base, 'invalid')), /must not contain/)
  }
})
