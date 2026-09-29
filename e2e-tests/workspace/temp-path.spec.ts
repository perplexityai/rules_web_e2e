import {expect, test} from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test('Chromium launches with a short canonical profile root', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Save', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Saved', exact: true})).toBeVisible()
  const temp = fs.realpathSync(process.env.TMPDIR!)
  expect(Buffer.byteLength(temp)).toBeLessThan(70)
  await page.screenshot({path: path.join(process.env.VRT_OUTPUTS!, 'browser.png')})
  fs.writeFileSync(path.join(process.env.VRT_OUTPUTS!, 'temp.json'), JSON.stringify(temp))
})
