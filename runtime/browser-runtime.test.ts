import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {browserRuntime, type BrowserRuntime} from './browser-runtime.js'

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
        LD_LIBRARY_PATH: path.join(root, 'lib'),
        FONTCONFIG_PATH: path.join(root, 'fonts'),
      },
    })
    assert.throws(() => browserRuntime(inputs, {...runtime, executable: 'missing'}), /ENOENT/)
    assert.throws(() => browserRuntime(inputs, {...runtime, executable: '../chrome'}), /Invalid browser runtime path/)
    fs.symlinkSync(process.execPath, path.join(root, 'host'))
    assert.throws(() => browserRuntime(inputs, {...runtime, executable: 'host'}), /escapes declared root/)
    assert.throws(() => browserRuntime(inputs, {...runtime, arch: process.arch === 'x64' ? 'arm64' : 'x64'}), /select a matching execution platform/)
  } finally {
    fs.rmSync(inputs, {recursive: true, force: true})
  }
})
