import {defineConfig} from '@playwright/test'
import {readFileSync} from 'node:fs'

if (process.env.UI_FIXTURE_PACKAGE) {
  if (JSON.parse(readFileSync(process.env.UI_FIXTURE_PACKAGE, 'utf8')).type !== 'module') {
    throw new Error('UI data fixture was not resolved')
  }
}

export default defineConfig({use: {baseURL: 'http://localhost:1234'}})
