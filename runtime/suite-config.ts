// Copied beside the generated config so native Playwright imports resolve to the selected runtime.
import {
  defineConfig,
  type PlaywrightTestConfig,
  type ReporterDescription,
} from '@playwright/test'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import path from 'node:path'
import {e2eConfig, componentBrowserConfig, visualConfig} from './config.js'
import {screenshotMatching, type VisualMatching} from './matching.js'

const mode = process.env.VRT_MODE!
const root = process.env.VRT_TEST_ROOT!
const visual = mode === 'visual' || mode === 'visual-spec'
const defaults = visual
  ? visualConfig({root})
  : mode === 'component'
    ? componentBrowserConfig({root, gallery: process.env.VRT_APP_URL!})
    : e2eConfig({root})
const custom = process.env.VRT_CONFIG_OVERRIDE
  ? ((await import(pathToFileURL(process.env.VRT_CONFIG_OVERRIDE).href))
      .default as PlaywrightTestConfig)
  : {}
if (visual && custom.projects)
  throw new Error(
    'Use separate visual targets and baseline directories instead of Playwright projects'
  )
const matching = process.env.VRT_MATCHING
  ? ((await import(pathToFileURL(process.env.VRT_MATCHING).href))
      .default as VisualMatching)
  : {}
// Resolve reporters from the consumer config, not this generated config's directory.
const builtInReporters = new Set([
  'blob',
  'dot',
  'line',
  'list',
  'github',
  'json',
  'junit',
  'null',
  'html',
  'perfetto',
])
const reporters =
  typeof custom.reporter === 'string'
    ? [[custom.reporter] as [string]]
    : (custom.reporter ?? [])
const resolveReporter = process.env.VRT_CONFIG_OVERRIDE
  ? createRequire(pathToFileURL(process.env.VRT_CONFIG_OVERRIDE)).resolve
  : undefined
const additionalReporters: ReporterDescription[] = reporters.map(
  ([name, ...options]) =>
    [
      builtInReporters.has(name) ? name : resolveReporter!(name),
      ...options,
    ] as ReporterDescription
)
// Keep browser connections, baseline updates, and required reports managed.
const merged = defineConfig(defaults, custom)
const configDirectory = process.env.VRT_CONFIG_OVERRIDE
  ? path.dirname(process.env.VRT_CONFIG_OVERRIDE)
  : root
const lifecycleModules = (value: string | string[] | undefined) =>
  value === undefined
    ? undefined
    : (Array.isArray(value) ? value : [value]).map(file =>
        createRequire(path.join(configDirectory, 'package.json')).resolve(file)
      )
const webServer = custom.webServer
  ? (Array.isArray(custom.webServer)
      ? custom.webServer
      : [custom.webServer]
    ).map(server => ({
      ...server,
      cwd: server.cwd
        ? path.resolve(configDirectory, server.cwd)
        : configDirectory,
      reuseExistingServer: false,
    }))
  : undefined
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
export default defineConfig(
  {...merged, webServer: undefined},
  {
    testDir: root,
    testMatch,
    testIgnore: [],
    outputDir: defaults.outputDir,
    reporter: [
      ...(defaults.reporter as ReporterDescription[]),
      ...additionalReporters.filter(
        ([name, options]) => name !== 'list' || options !== undefined
      ),
    ],
    updateSnapshots: defaults.updateSnapshots,
    snapshotPathTemplate: visual
      ? defaults.snapshotPathTemplate
      : custom.snapshotPathTemplate,
    webServer,
    globalSetup: lifecycleModules(custom.globalSetup),
    globalTeardown: lifecycleModules(custom.globalTeardown),
    use: managedUse,
    ...(merged.projects
      ? {
          projects: merged.projects.map(project => ({
            ...project,
            testDir: root,
            testMatch,
            testIgnore: [],
            outputDir: defaults.outputDir,
            snapshotPathTemplate:
              project.snapshotPathTemplate ?? custom.snapshotPathTemplate,
            use: {
              ...managedUse,
              ...project.use,
              connectOptions: defaults.use!.connectOptions,
              browserName: 'chromium' as const,
            },
          })),
        }
      : {}),
    ...(visual
      ? {
          expect: {
            ...merged.expect,
            toHaveScreenshot: {
              animations: 'disabled',
              caret: 'hide',
              scale: custom.expect?.toHaveScreenshot?.scale ?? 'css',
              ...screenshotMatching(matching),
            },
          },
        }
      : {}),
  }
)
