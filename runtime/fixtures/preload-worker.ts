import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {chromium} from 'playwright'
import {startBrowser} from '../container.js'
import {GenericContainer} from 'testcontainers'
const require = createRequire(import.meta.url)
let stop: (() => Promise<void>) | undefined
try {
  if (process.env.DIRECT_IMAGE) {
    process.env.TESTCONTAINERS_PULL_POLICY = 'never'
    process.env.TESTCONTAINERS_PRELOADED_IMAGES_ONLY = 'true'
    await new GenericContainer(process.env.DIRECT_IMAGE).start()
    throw new Error('A missing image unexpectedly started')
  }
  const browser = await startBrowser(process.env.BROWSER_IMAGE!,
    path.dirname(createRequire(require.resolve('playwright/package.json')).resolve('playwright-core/package.json')))
  stop = browser.stop
  const client = await chromium.connect(browser.endpoint)
  try {
    const page = await client.newPage()
    await page.setContent('<h1>Preloaded browser</h1>')
    if (await page.locator('h1').textContent() !== 'Preloaded browser') throw new Error('Browser did not render')
  } finally { await client.close() }
  await stop()
  stop = undefined
  process.send?.({ready: true})
  // Keep the original Ryuk connection alive while other workers exercise reuse.
  await new Promise<void>(resolve => process.once('message', () => resolve()))
} catch (error) {
  process.send?.({error: String(error)})
  process.exitCode = 1
} finally {
  await stop?.()
  process.disconnect?.()
}
