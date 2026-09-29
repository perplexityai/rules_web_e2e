import {expect, test} from '@playwright/test'

test('server resolves staged transitive npm dependencies', async ({page}) => {
  await page.goto('/')
  const heading = page.getByRole('heading')
  await expect(heading).toHaveText('transitive dependency reached / alias contents reached')
  await expect(heading).toHaveScreenshot('npm-dependencies.png')
})
