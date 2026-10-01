import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {browserRuntime, stageFfmpeg, workerLibraryPath, type BrowserRuntime} from './browser-runtime.js'

test('declared browser resolution refuses host fallback and escaping files', {
  skip: process.platform !== 'linux',
}, () => {
  const inputs = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-runtime-'))
  const root = path.join(inputs, 'runtime')
  fs.mkdirSync(root)
  for (const file of ['node', 'chrome']) fs.writeFileSync(path.join(root, file), '')
  for (const directory of ['lib', 'fonts']) fs.mkdirSync(path.join(root, directory))
  const runtime: BrowserRuntime = {
    root: 'runtime', node: 'node', executable: 'chrome',
    libraryDirs: ['lib'], fontconfig: 'fonts', arch: process.arch as 'x64' | 'arm64',
  }
  try {
    assert.deepEqual(browserRuntime(inputs, runtime), {
      node: path.join(root, 'node'),
      env: {
        VRT_CHROMIUM_EXECUTABLE: path.join(root, 'chrome'),
        LD_LIBRARY_PATH: workerLibraryPath + path.delimiter + path.join(root, 'lib'),
        FONTCONFIG_PATH: path.join(root, 'fonts'),
      },
    })
    assert.throws(() => browserRuntime(inputs, {...runtime, executable: 'missing'}), /ENOENT/)
    assert.throws(() => browserRuntime(inputs, {...runtime, executable: '../chrome'}), /Invalid browser runtime path/)
    fs.symlinkSync(process.execPath, path.join(root, 'host'))
    assert.throws(() => browserRuntime(inputs, {...runtime, executable: 'host'}), /escapes declared root/)
    const hostBrowser = browserRuntime(inputs, {...runtime, executable: 'host'}, true).env.VRT_CHROMIUM_EXECUTABLE
    assert.equal(fs.statSync(hostBrowser).ino, fs.statSync(process.execPath).ino)
    assert.throws(() => browserRuntime(inputs, {...runtime, arch: process.arch === 'x64' ? 'arm64' : 'x64'}), /select a matching execution platform/)
  } finally {
    fs.rmSync(inputs, {recursive: true, force: true})
  }
})

test('stages declared FFmpeg at the selected Playwright revision', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-runtime-'))
  try {
    const core = path.join(root, 'core')
    const cache = path.join(root, 'cache')
    const executable = path.join(root, 'ffmpeg-linux')
    fs.mkdirSync(core)
    fs.writeFileSync(executable, 'declared helper')
    fs.writeFileSync(path.join(core, 'browsers.json'), JSON.stringify({
      browsers: [{name: 'ffmpeg', revision: '1011'}],
    }))
    stageFfmpeg(core, executable, cache)
    assert.equal(
      fs.realpathSync(path.join(cache, 'ms-playwright', 'ffmpeg-1011', 'ffmpeg-linux')),
      fs.realpathSync(executable),
    )
    fs.writeFileSync(path.join(core, 'browsers.json'), JSON.stringify({
      browsers: [{name: 'ffmpeg', revision: '../outside'}],
    }))
    assert.throws(() => stageFfmpeg(core, executable, cache), /platform-independent FFmpeg revision/)
  } finally {
    fs.rmSync(root, {recursive: true, force: true})
  }
})
