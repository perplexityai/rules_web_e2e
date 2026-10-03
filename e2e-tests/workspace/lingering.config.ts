import type {PlaywrightTestConfig} from '@playwright/test'

const config: PlaywrightTestConfig = {
  globalTeardown: './lingering.teardown.js',
}
export default config
