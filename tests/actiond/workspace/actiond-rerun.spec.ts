
import {expect, test} from '@playwright/test'
test('Bazel launches a new browser for each run', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Save', exact: true})).toBeVisible()
  expect(['1', '2']).toContain(process.env.TEST_RUN_NUMBER)
  console.log('BROWSER_EXECUTION ' + await page.evaluate(() => crypto.randomUUID()))
})
