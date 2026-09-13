import type {PlaywrightTestConfig} from '@playwright/test'
import path from 'node:path'

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
    command: process.env.EXAMPLE_SERVER_COMMAND
      ? `"${path.join(process.env.RUNFILES_DIR!, process.env.TEST_WORKSPACE!, process.env.EXAMPLE_SERVER_COMMAND)}"`
      : `"${process.execPath}" native-server.js`,
    url: baseURL,
    env: {...JSON.parse(process.env.EXAMPLE_SERVER_ENV || '{}'), PORT: String(port)},
  },
}
export default config
