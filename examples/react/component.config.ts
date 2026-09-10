import {defineConfig, type PlaywrightTestConfig} from '@playwright/test'
import {e2eConfig} from '@rules-web-e2e/vrt'
import {fileURLToPath} from 'node:url'

const defaults = e2eConfig({root: fileURLToPath(new URL('.', import.meta.url))})
const config: PlaywrightTestConfig = defineConfig(defaults, {
  testMatch: '**/*.browser.spec.ts',
  use: {
    baseURL: new URL('./gallery.html', defaults.use!.baseURL).href,
    serviceWorkers: 'block',
  },
})
export default config
