import {createRequire} from 'node:module'

// Resolve through the selected package's own exports, preserving the consumer's
// Playwright instance without creating or modifying node_modules at test time.
// Direct module tests use their ordinary declared dependency graph.
export const {chromium, defineConfig, expect, test} = createRequire(
  process.env.VRT_PLAYWRIGHT_PACKAGE || import.meta.url
)('@playwright/test') as typeof import('@playwright/test')
