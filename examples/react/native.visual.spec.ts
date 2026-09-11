import {expect, test} from '@playwright/test'

test('native specs own the interaction before capture', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Save', exact: true}).click()
  await expect(
    page.getByRole('button', {name: 'Saved', exact: true})
  ).toHaveScreenshot('saved.png')
})
