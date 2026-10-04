// Copied beside the generated config so native Playwright imports resolve to the selected runtime.
import {
  defineConfig,
  type PlaywrightTestConfig,
  type ReporterDescription,
} from '@playwright/test'
import {pathToFileURL, fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import path from 'node:path'
import {e2eConfig, componentBrowserConfig, visualConfig, processConfig} from './config.js'
import {screenshotMatching, type VisualMatching} from './matching.js'

const mode = process.env.VRT_MODE!
const processOwned = mode === 'process'
const root = process.env.VRT_TEST_ROOT!
const visual = mode === 'visual' || mode === 'visual-spec'
const exportSnapshots = !visual && process.env.VRT_EXPORT_SNAPSHOTS === '1'
function snapshotExportPath(template?: string) {
  const filename = template ? path.basename(template) : '{arg}{-projectName}{-snapshotSuffix}{ext}'
  return path.join(process.env.VRT_OUTPUTS!, 'snapshots/{testFilePath}-snapshots', filename)
}
const isolated = process.env.VRT_ISOLATED === '1'
const defaults = processOwned
  ? processConfig({root})
  : visual
  ? visualConfig({root})
  : mode === 'component'
    ? componentBrowserConfig({root, gallery: process.env.VRT_APP_URL!})
    : e2eConfig({root})
const custom = process.env.VRT_CONFIG_OVERRIDE
  ? ((await import(pathToFileURL(process.env.VRT_CONFIG_OVERRIDE).href))
      .default as PlaywrightTestConfig)
  : {}
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
      chromiumSandbox: false,
      args: [...(use?.launchOptions?.args ?? []), '--no-zygote'],
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
    snapshotPathTemplate: visual
      ? defaults.snapshotPathTemplate
      : exportSnapshots ? snapshotExportPath(custom.snapshotPathTemplate) : custom.snapshotPathTemplate,
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
              exportSnapshots ? snapshotExportPath(project.snapshotPathTemplate ?? custom.snapshotPathTemplate) : project.snapshotPathTemplate ?? custom.snapshotPathTemplate,
            use: processOwned ? {...managedUse, ...project.use} : isolatedUse({
              ...managedUse,
              ...project.use,
              connectOptions: defaults.use!.connectOptions,
              browserName: 'chromium' as const,
            }),
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
