import {expect, test} from '@playwright/test'

test('exports a page snapshot without editing source baselines', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Save', exact: true})).toBeVisible()
  await expect(page).toHaveScreenshot('page.png')
})

test('second snapshot stays untouched by filtered updates', async ({page}) => {
  await page.goto('/')
  await expect(page).toHaveScreenshot('second.png')
})

test('failed capture never applies', async ({page}) => {
  test.skip(!process.env.SNAPSHOT_FAIL)
  await page.goto('/')
  await expect(page).toHaveScreenshot('failed.png')
  expect(true).toBe(false)
})
