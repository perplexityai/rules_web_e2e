import type {PlaywrightTestConfig} from '@playwright/test'

const seed = process.env.TEST_TMPDIR ?? 'native-example'
const port =
  20_000 +
  [...seed].reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) % 20_000,
    0
  )
const baseURL = `http://127.0.0.1:${port}`
const config: PlaywrightTestConfig = {
  use: {baseURL},
  webServer: {
    command: `"${process.execPath}" native-server.js`,
    url: baseURL,
    env: {PORT: String(port)},
  },
}
export default config
