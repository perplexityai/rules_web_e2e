import type {PlaywrightTestConfig} from '@playwright/test'
import native from './native.config.js'

// Full Chromium creates SingletonSocket; the headless shell does not exercise
// the profile socket regression that motivated the short temp-root policy.
const config: PlaywrightTestConfig = {...native, use: {...native.use, channel: 'chromium'}}
export default config
