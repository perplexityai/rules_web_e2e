// Built into each suite by Bazel; only execution settings come from the runner.
import {
  type PlaywrightTestConfig,
  type ReporterDescription,
} from '@playwright/test'
import {defineConfig} from './playwright-test.js'
import {pathToFileURL, fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import path from 'node:path'
import {e2eConfig, componentBrowserConfig, visualConfig, processConfig} from './config.js'
import {screenshotMatching, type VisualMatching} from './matching.js'
import {remoteAppUrl} from './network.js'

const mode = process.env.VRT_MODE!
const processOwned = mode === 'process'
const root = process.env.VRT_TEST_ROOT!
const visual = mode === 'visual' || mode === 'visual-spec'
const exportSnapshots = !visual && process.env.VRT_EXPORT_SNAPSHOTS === '1'
const managedSnapshots = !visual && !!process.env.VRT_SNAPSHOT_ROOT
const snapshotRoot = exportSnapshots
  ? path.join(process.env.VRT_OUTPUTS!, 'snapshots')
  : process.env.VRT_SNAPSHOT_ROOT
function snapshotPath(project = 'default') {
  return path.join(snapshotRoot!, project, '{testFilePath}-snapshots', '{arg}{-snapshotSuffix}{ext}')
}
function snapshotExpect(expect: PlaywrightTestConfig['expect'], project?: string) {
  return {
    ...expect,
    toHaveScreenshot: {...expect?.toHaveScreenshot, pathTemplate: snapshotPath(project)},
    toMatchAriaSnapshot: {...expect?.toMatchAriaSnapshot, pathTemplate: snapshotPath(project)},
  }
}
const isolated = process.env.VRT_ISOLATED === '1'
const custom = process.env.VRT_CONFIG_OVERRIDE
  ? ((await import(pathToFileURL(process.env.VRT_CONFIG_OVERRIDE).href))
      .default as PlaywrightTestConfig)
  : {}
// Config-only suites already load this module in Playwright. Resolve their URL
// here instead of importing the consumer config in a second Node process.
if (!processOwned && !process.env.VRT_APP_URL) {
  const url = remoteAppUrl({VRT_BASE_URL: custom.use?.baseURL})
  if (!url) throw new Error('A config-only target must set use.baseURL')
  for (const project of custom.projects ?? [])
    if (project.use?.baseURL && new URL(project.use.baseURL).origin !== new URL(url).origin)
      throw new Error('Projects with different origins need separate browser targets')
  process.env.VRT_APP_URL = url
}
const defaults = processOwned
  ? processConfig({root})
  : visual
  ? visualConfig({root})
  : mode === 'component'
    ? componentBrowserConfig({root, gallery: process.env.VRT_APP_URL!})
    : e2eConfig({root})
// Bazel declares the suite. Native projects may vary execution settings, but
// cannot silently repartition those inputs with a second discovery policy.
for (const [scope, selection] of [
  ['config', custom],
  ...(custom.projects ?? []).map((project, index) => [
    `project ${project.name ?? index}`,
    project,
  ] as const),
] as const) {
  for (const key of ['testMatch', 'testIgnore', 'testDir'] as const)
    if (selection[key] !== undefined)
      throw new Error(
        `${scope}.${key} is unsupported: select compiled specs with the Bazel tests attribute; ` +
          'use separate targets for independent suites and fixtures for setup'
      )
}
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
if (
  !visual && !processOwned &&
  (custom.use?.connectOptions ||
    custom.projects?.some(project => project.use?.connectOptions))
)
  throw new Error(
    'E2E and component tests launch host browsers; connectOptions is unsupported'
  )

// Declared runtimes own executable selection; native launch options may tune it.
function isolatedUse(use: PlaywrightTestConfig['use']) {
  if (!isolated) return use
  if (use?.channel || use?.launchOptions?.executablePath || use?.headless === false || use?.launchOptions?.headless === false)
    throw new Error('Isolated browser tests require the declared headless Chromium; channel, executablePath, and headed mode are unsupported')
  return {
    ...use,
    headless: true,
    launchOptions: {
      ...use?.launchOptions,
      executablePath: process.env.VRT_CHROMIUM_EXECUTABLE!,
      chromiumSandbox: process.env.VRT_EXECUTION === 'local',
      args: [...(use?.launchOptions?.args ?? []), ...(process.env.VRT_EXECUTION === 'local' ? [] : ['--no-zygote'])],
    },
  }
}
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
const managedUse = processOwned ? merged.use : {
  ...merged.use,
  connectOptions: defaults.use!.connectOptions,
  ...(visual
    ? {launchOptions: defaults.use!.launchOptions}
    : {}),
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
    updateSnapshots: exportSnapshots ? 'all' : defaults.updateSnapshots,
    ...(exportSnapshots || managedSnapshots ? {updateSourceMethod: 'patch' as const} : {}),
    snapshotPathTemplate: visual
      ? defaults.snapshotPathTemplate
      : exportSnapshots || managedSnapshots ? snapshotPath() : custom.snapshotPathTemplate,
    webServer,
    globalSetup: isolated || processOwned ? lifecycleModules(custom.globalSetup) : [
      ...(lifecycleModules(custom.globalSetup) ?? []),
      fileURLToPath(new URL('./host-browser-check.js', import.meta.url)),
    ],
    globalTeardown: lifecycleModules(custom.globalTeardown),
    use: isolated && !visual ? isolatedUse(managedUse) : managedUse,
    ...(merged.projects
      ? {
          projects: merged.projects.map(project => ({
            ...project,
            testDir: root,
            testMatch,
            testIgnore: [],
            outputDir: defaults.outputDir,
            snapshotPathTemplate:
              exportSnapshots || managedSnapshots ? snapshotPath(`project-${encodeURIComponent(project.name || '')}`) : project.snapshotPathTemplate ?? custom.snapshotPathTemplate,
            ...(exportSnapshots || managedSnapshots ? {expect: snapshotExpect({...merged.expect, ...project.expect}, `project-${encodeURIComponent(project.name || '')}`)} : {}),
            use: processOwned ? {...managedUse, ...project.use} : isolatedUse({
              ...managedUse,
              ...project.use,
              connectOptions: defaults.use!.connectOptions,
              browserName: 'chromium' as const,
            }),
          })),
        }
      : {}),
    ...(exportSnapshots || managedSnapshots ? {expect: snapshotExpect(merged.expect)} : {}),
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
