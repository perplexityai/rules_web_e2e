import fs from 'node:fs'
import path from 'node:path'
import {chromium, type FullConfig} from '@playwright/test'
import {validateChromiumVersion} from './versions.js'

/** Check the browser Playwright actually selects, including native project options. */
export default async function checkHostBrowsers(config: FullConfig) {
  const registry = JSON.parse(fs.readFileSync(
    path.join(process.env.VRT_PLAYWRIGHT_CORE!, 'browsers.json'), 'utf8'
  ))
  for (const project of config.projects) {
    const {launchOptions, headless, channel} = project.use
    const browser = await chromium.launch({
      ...launchOptions,
      ...(headless !== undefined ? {headless} : {}),
      ...(channel !== undefined ? {channel} : {}),
    })
    try {
      validateChromiumVersion(registry, browser.version())
    } finally {
      await browser.close()
    }
  }
}
