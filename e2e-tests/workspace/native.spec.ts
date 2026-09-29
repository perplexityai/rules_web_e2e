import {expect, test} from '@playwright/test'

test('page interaction, native config, and reload isolation', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Save', exact: true}).click()
  await expect(
    page.getByRole('button', {name: 'Saved', exact: true})
  ).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', {name: 'Save', exact: true})).toBeVisible()
})
