import {expect, test} from '@playwright/test'

test('renders an interactive card', async ({page}) => {
  await page.goto(process.env.VRT_APP_URL!)
  await page.getByRole('button', {name: 'Save', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Saved'})).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('#card-root')).toHaveScreenshot('card-saved.png')
})
