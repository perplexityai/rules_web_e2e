import {expect, test} from '@playwright/test'

test.use({video: 'on'})

test('records page interaction with the declared FFmpeg helper', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Save', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Saved', exact: true})).toBeVisible()
  expect(page.video()).not.toBeNull()
})
