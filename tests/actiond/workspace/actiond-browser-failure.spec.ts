
import {test} from '@playwright/test'
test('ordinary failure reaches Bazel', async ({page}) => {
  await page.goto('/')
  console.log('BROWSER_EXECUTION ' + await page.evaluate(() => crypto.randomUUID()))
  throw new Error('Intentional ordinary browser failure')
})
