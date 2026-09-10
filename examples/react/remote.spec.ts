import {expect, test} from '@playwright/test'

test('remote endpoint preserves base paths and restricts other destinations', async ({
  page,
}) => {
  await page.goto('./')
  await expect(page.getByRole('heading')).toHaveText('External fixture')
  await page.getByRole('button', {name: 'Save'}).click()
  await expect(page.getByRole('button')).toHaveText('Saved')
  await expect(page).toHaveURL(/\/fixture\/$/)
  const response = await page.evaluate(async blockedUrl => {
    try {
      await fetch(blockedUrl, {signal: AbortSignal.timeout(2000)})
      return 'allowed'
    } catch {
      return 'blocked'
    }
  }, process.env.EXAMPLE_BLOCKED_URL!)
  expect(response).toBe('blocked')
})
