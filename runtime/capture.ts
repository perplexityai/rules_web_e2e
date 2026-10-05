// Bazel installs this compiled template in the declared suite harness.
import fs from 'node:fs'
import {expect, test} from './playwright-test.js'
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
  let catalogChecked = false
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
        if (!catalogChecked) {
          expect(await page.evaluate(() => window.rulesVisuals.captures), 'Gallery must match its declared capture manifest').toEqual(captures)
          catalogChecked = true
        }
        await page.evaluate(async visual => {
          if (visual.documentLanguage)
            document.documentElement.lang = visual.documentLanguage
          await window.rulesVisuals.mount({story: visual.id})
        }, visual)
        if (visual.hoverSelector)
          await page.locator(visual.hoverSelector).hover()
        await page.evaluate(() => window.rulesVisuals.prepareCapture())
        const subject = visual.capture === 'viewport'
          ? page
          : page.locator('[data-rules-visual-capture]')
        await expect(subject).toHaveScreenshot(visual.screenshotName)
      })
    })
  }
}
