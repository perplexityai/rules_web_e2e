import {expect, test} from '@playwright/test'

test('native webServer serves the declared config endpoint', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Save', exact: true}).click()
  await expect(
    page.getByRole('button', {name: 'Saved', exact: true})
  ).toBeVisible()
})
