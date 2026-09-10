// Copied beside the generated config so native Playwright imports resolve to the selected runtime.
import {defineConfig, type PlaywrightTestConfig} from '@playwright/test'
import {pathToFileURL} from 'node:url'
import {e2eConfig, componentBrowserConfig, visualConfig} from './config.js'
import {screenshotMatching, type VisualMatching} from './matching.js'

const mode = process.env.VRT_MODE!
const root = process.env.VRT_TEST_ROOT!
const defaults =
  mode === 'visual'
    ? visualConfig({root})
    : mode === 'component'
      ? componentBrowserConfig({root, gallery: process.env.VRT_APP_URL!})
      : e2eConfig({root})
const custom = process.env.VRT_CONFIG_OVERRIDE
  ? ((await import(pathToFileURL(process.env.VRT_CONFIG_OVERRIDE).href))
      .default as PlaywrightTestConfig)
  : {}
if (mode === 'visual' && custom.projects)
  throw new Error(
    'Use separate visual targets and baseline directories instead of Playwright projects'
  )
const matching = process.env.VRT_MATCHING
  ? ((await import(pathToFileURL(process.env.VRT_MATCHING).href))
      .default as VisualMatching)
  : {}
// Consumers may customize fixtures/projects, but not disconnect from the managed browser
// or redirect baseline updates and reports outside the runner's output directories.
const merged = defineConfig(defaults, custom)
const testMatch =
  mode === 'visual'
    ? '**/.rules-visual.spec.js'
    : (JSON.parse(process.env.VRT_TEST_FILES!) as string[]).map(
        file =>
          new RegExp('^' + file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')
      )
const managedUse = {
  ...merged.use,
  connectOptions: defaults.use!.connectOptions,
  browserName: 'chromium' as const,
}
export default defineConfig(merged, {
  testDir: root,
  testMatch,
  testIgnore: [],
  outputDir: defaults.outputDir,
  reporter: defaults.reporter,
  updateSnapshots: defaults.updateSnapshots,
  snapshotPathTemplate: defaults.snapshotPathTemplate,
  use: managedUse,
  ...(merged.projects
    ? {
        projects: merged.projects.map(project => ({
          ...project,
          testDir: root,
          testMatch,
          testIgnore: [],
          outputDir: defaults.outputDir,
          snapshotPathTemplate: defaults.snapshotPathTemplate,
          use: {
            ...managedUse,
            ...project.use,
            connectOptions: defaults.use!.connectOptions,
            browserName: 'chromium' as const,
          },
        })),
      }
    : {}),
  ...(mode === 'visual'
    ? {
        expect: {
          ...merged.expect,
          toHaveScreenshot: {
            animations: 'disabled',
            caret: 'hide',
            scale: 'css',
            ...screenshotMatching(matching),
          },
        },
      }
    : {}),
})
