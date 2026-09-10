import {expect, test} from '@playwright/test'

test('saves the card and resets local state on reload', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Save', exact: true}).click()
  await expect(
    page.getByRole('button', {name: 'Saved', exact: true})
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('button', {name: 'Save', exact: true})
  ).toBeVisible()
})
