import type {PlaywrightTestConfig} from '@playwright/test'

const config: PlaywrightTestConfig = {use: {baseURL: 'https://fixture.invalid', serviceWorkers: 'block'}}
export default config
