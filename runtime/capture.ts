// The runner copies this compiled template into the private consumer test directory.
import fs from 'node:fs'
import {expect, test} from '@playwright/test'
import {validateCaptures} from './visuals.js'

const catalog = process.env.VRT_VISUAL_CATALOG!
if (process.env.VRT_DISCOVER === '1') {
  test('discover visual modules', async ({page, baseURL}) => {
    await page.goto(baseURL!)
    await page.waitForFunction(() => !!window.rulesVisuals)
    const captures = await page.evaluate(() => window.rulesVisuals.captures)
    validateCaptures(captures)
    fs.writeFileSync(catalog, JSON.stringify(captures))
  })
} else {
  const captures: unknown = JSON.parse(fs.readFileSync(catalog, 'utf8'))
  validateCaptures(captures)
  for (const visual of captures) {
    test.describe(visual.id, () => {
      test.use({
        ...(visual.viewport ? {viewport: visual.viewport} : {}),
        ...(visual.deviceScaleFactor
          ? {deviceScaleFactor: visual.deviceScaleFactor}
          : {}),
        ...(visual.theme ? {colorScheme: visual.theme} : {}),
      })
      test(visual.name, async ({page, baseURL}) => {
        await page.goto(baseURL!)
        await page.waitForFunction(() => !!window.rulesVisuals)
        await page.evaluate(async visual => {
          if (visual.documentLanguage)
            document.documentElement.lang = visual.documentLanguage
          await window.rulesVisuals.mount({story: visual.id})
          await window.rulesVisuals.prepareCapture()
        }, visual)
        await expect(
          page.locator('[data-rules-visual-capture]')
        ).toHaveScreenshot(visual.screenshotName)
      })
    })
  }
}
