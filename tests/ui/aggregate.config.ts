import {defineConfig} from '@playwright/test'
import config from './ui.config.js'

export default defineConfig({
  ...config,
  projects: [{name: 'overridden', testDir: './unselected', testMatch: '**/*.never'}],
})
