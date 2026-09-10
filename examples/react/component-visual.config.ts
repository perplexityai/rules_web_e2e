import {defineConfig, type PlaywrightTestConfig} from '@playwright/test'
import {visualConfig} from '@rules-web-e2e/vrt'
import {fileURLToPath} from 'node:url'

const defaults = visualConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
})
const config: PlaywrightTestConfig = defineConfig(defaults, {
  use: {
    baseURL: new URL('./gallery.html', defaults.use!.baseURL).href,
    serviceWorkers: 'block',
  },
})
export default config
