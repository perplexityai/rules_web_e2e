import {expect, test} from '@playwright/test'

test('executes the caller package with its transitive dependencies intact', async ({page}) => {
  await page.goto('/')
  const heading = page.getByRole('heading')
  await expect(heading).toHaveText('transitive dependency reached / alias contents reached')
  if (process.env.VRT_MODE === 'visual-spec')
    await expect(heading).toHaveScreenshot('caller-package.png')
})
