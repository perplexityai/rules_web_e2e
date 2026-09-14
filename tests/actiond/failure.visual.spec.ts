import {expect, test} from '@playwright/test'

test('a failure after capture must not apply partial baselines', async ({page}) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Save', exact: true})).toHaveScreenshot('partial.png')
  if (process.env.ACTIOND_HANG) await new Promise(() => {})
  throw new Error('Intentional failure after screenshot capture')
})
