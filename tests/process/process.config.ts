import type {PlaywrightTestConfig} from '@playwright/test'

const config: PlaywrightTestConfig = {
  use: {browserName: 'firefox', launchOptions: {executablePath: '/caller-owned'}},
}
export default config
