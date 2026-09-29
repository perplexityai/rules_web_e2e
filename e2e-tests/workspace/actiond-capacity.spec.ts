import {expect, test} from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

test('configured VM memory is visible to a real browser action', async ({page}) => {
  // Linux reserves some of the configured guest RAM for the kernel.
  const mib = os.totalmem() / (1024 * 1024)
  expect(mib).toBeGreaterThan(8192 * 0.9)
  expect(mib).toBeLessThanOrEqual(8192)
  await page.goto('/')
  await page.getByRole('button', {name: 'Save', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Saved', exact: true})).toBeVisible()
  const screenshot = path.join(process.env.VRT_OUTPUTS!, 'capacity-browser.png')
  await page.screenshot({path: screenshot})
  await test.info().attach('capacity-browser', {path: screenshot, contentType: 'image/png'})
})
