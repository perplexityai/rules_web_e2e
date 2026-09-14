import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {chromium, type Browser, type FullConfig} from '@playwright/test'
import checkHostBrowsers from './host-browser-check.js'

test('host setup checks each selected browser and closes a mismatched browser', async t => {
  const core = fs.mkdtempSync(path.join(os.tmpdir(), 'host-version-'))
  const previous = process.env.VRT_PLAYWRIGHT_CORE
  process.env.VRT_PLAYWRIGHT_CORE = core
  fs.writeFileSync(path.join(core, 'browsers.json'), JSON.stringify({browsers: [
    {name: 'chromium-headless-shell', browserVersion: '153.0.8010.12'},
  ]}))
  let closed = 0
  const launch = t.mock.method(chromium, 'launch', async () => ({
    version: () => closed === 0 ? '153.0.8010.12' : '152.0.0.1',
    close: async () => { closed++ },
  } as Browser))
  try {
    await assert.rejects(checkHostBrowsers({projects: [
      {use: {headless: true}},
      {use: {headless: false, channel: 'chromium', launchOptions: {executablePath: '/caller/chrome'}}},
    ]} as FullConfig), /expects 153\.0\.8010\.12, got 152\.0\.0\.1/)
    assert.equal(closed, 2)
    assert.deepEqual(launch.mock.calls.map(call => call.arguments[0]), [
      {headless: true},
      {headless: false, channel: 'chromium', executablePath: '/caller/chrome'},
    ])
  } finally {
    if (previous === undefined) delete process.env.VRT_PLAYWRIGHT_CORE
    else process.env.VRT_PLAYWRIGHT_CORE = previous
    fs.rmSync(core, {recursive: true, force: true})
  }
})
