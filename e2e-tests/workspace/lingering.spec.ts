import {expect, test} from '@playwright/test'

test('browser finishes before a background descendant', async ({page}) => {
  await page.setContent('<button>Ready</button>')
  await expect(page.getByRole('button', {name: 'Ready'})).toBeVisible()
  await page.screenshot({path: `${process.env.VRT_OUTPUTS}/browser.png`})
})
