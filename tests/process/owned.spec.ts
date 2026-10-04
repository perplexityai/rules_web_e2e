import {execFileSync} from 'node:child_process'
import {test, expect} from '@playwright/test'

test('caller owns the executable without a host Chromium or application URL', ({}, testInfo) => {
  const result = execFileSync(process.execPath, [process.env.OWNED_PROCESS_TOOL!], {encoding: 'utf8'})
  expect(result).toBe('declared')
  if (process.env.OWNED_DEFAULT_CONFIG === '1') {
    expect(testInfo.project.use.launchOptions?.executablePath).toBeUndefined()
    expect(testInfo.project.use.baseURL).toBeUndefined()
    return
  }
  expect(testInfo.project.use.browserName).toBe('firefox')
  expect(testInfo.project.use.launchOptions?.executablePath).toBe('/caller-owned')
  expect(testInfo.project.use.baseURL).toBeUndefined()
  expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBeUndefined()
})
