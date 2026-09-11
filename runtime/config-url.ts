import {pathToFileURL} from 'node:url'
import type {PlaywrightTestConfig} from '@playwright/test'
import {remoteAppUrl} from './network.js'

// Inspect in the same staged environment used by Playwright. Native webServer
// startup and teardown remain owned by Playwright, including multi-server setups.
const config = (
  await import(pathToFileURL(process.env.VRT_CONFIG_OVERRIDE!).href)
).default as PlaywrightTestConfig
const url = remoteAppUrl({VRT_BASE_URL: config.use?.baseURL})
if (!url) throw new Error('A config-only target must set use.baseURL')
for (const project of config.projects ?? []) {
  if (
    project.use?.baseURL &&
    new URL(project.use.baseURL).origin !== new URL(url).origin
  )
    throw new Error(
      'Projects with different origins need separate browser targets'
    )
}
process.send?.({url})
