import assert from 'node:assert/strict'
import {test} from 'node:test'
import {validateChromiumVersion} from './versions.js'

test('Chromium must match the selected Playwright browser metadata', () => {
  const registry = {browsers: [{name: 'chromium-headless-shell', browserVersion: '153.0.8010.12'}]}
  validateChromiumVersion(registry, 'Google Chrome for Testing 153.0.8010.12\n')
  assert.throws(() => validateChromiumVersion(registry, '154.0.0.1'), /expects 153\.0\.8010\.12, got 154\.0\.0\.1/)
  assert.throws(() => validateChromiumVersion(registry, 'unrecognized output'), /Chromium version mismatch/)
  assert.throws(() => validateChromiumVersion({browsers: []}, '153.0.8010.12'), /declared headless-shell version/)
})
