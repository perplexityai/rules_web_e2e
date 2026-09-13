import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {hostBrowserEnvironment} from './host-browser.js'
import {testEnvironment} from './isolation.js'

test('host browser cache survives fixture isolation without implicit downloads', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'host-browser-'))
  try {
    const cache = path.join(temp, 'browsers')
    fs.mkdirSync(cache)
    const env = {...testEnvironment({}, [], temp), ...hostBrowserEnvironment(cache)}
    assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, cache)
    assert.equal(env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD, '1')
    // AGI supplies $(rootpath @playwright//:chromium)/../ from declared data.
    fs.mkdirSync(path.join(cache, 'chromium-1243'))
    assert.equal(hostBrowserEnvironment('browsers/chromium-1243/../', temp).PLAYWRIGHT_BROWSERS_PATH, cache)
    const file = path.join(temp, 'file')
    fs.writeFileSync(file, '')
    for (const value of [undefined, '', '0', 'relative/path', path.join(temp, 'missing'), file])
      assert.throws(() => hostBrowserEnvironment(value), /Install Chromium/)
  } finally {
    fs.rmSync(temp, {recursive: true, force: true})
  }
})
