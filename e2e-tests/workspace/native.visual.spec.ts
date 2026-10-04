import path from 'node:path'
import {expect, test} from '@playwright/test'

test('native specs own the interaction before capture', async ({page}, testInfo) => {
  const expected = testInfo.snapshotPath('saved.png', {kind: 'screenshot'})
  const relative = path.relative(process.env.RUNFILES_DIR!, expected)
  const declaredReference = !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)
  expect(declaredReference).toBe(process.env.VRT_UPDATE !== '1')

  await page.goto('/')
  console.log('BROWSER_EXECUTION ' + await page.evaluate(() => crypto.randomUUID()))
  await page.getByRole('button', {name: 'Save', exact: true}).click()
  await expect(
    page.getByRole('button', {name: 'Saved', exact: true})
  ).toHaveScreenshot('saved.png')
})
