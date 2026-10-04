import {expect, test} from '@playwright/test'

test('exports a page snapshot without editing source baselines', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Save', exact: true})).toBeVisible()
  await expect(page).toHaveScreenshot('page.png')
})
