import {expect, test} from '@playwright/test'

test('a failure after capture must not apply partial baselines', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Save', exact: true})).toHaveScreenshot('partial.png')
  throw new Error('Intentional failure after screenshot capture')
})
