import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import {pathToFileURL} from 'node:url'

export function aggregateConfig(config: string, tests: string[]): string {
  if (!tests.length) throw new Error('UI aggregation requires at least one spec')
  let root = path.dirname(tests[0])
  while (tests.some(file => path.relative(root, file).split(path.sep)[0] === '..')) root = path.dirname(root)
  const matches = tests.map(file => '^' + file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')
  return `import config from ${JSON.stringify(pathToFileURL(config).href)};
const selection = {testDir: ${JSON.stringify(root)}, testMatch: ${JSON.stringify(matches)}.map(pattern => new RegExp(pattern)), testIgnore: []};
const servers = config.webServer ? (Array.isArray(config.webServer) ? config.webServer : [config.webServer]).map(server => ({...server, cwd: server.cwd ?? ${JSON.stringify(path.dirname(config))}})) : undefined;
export default {...config, ...selection, webServer: servers, projects: config.projects?.map(project => ({...project, ...selection}))};
`
}

export async function launchUI(): Promise<number> {
  const runfiles = process.env.RUNFILES_DIR || process.env.JS_BINARY__RUNFILES
  if (!runfiles) throw new Error('UI launcher requires Bazel runfiles')
  const manifest = process.env.WEB_E2E_UI_INPUTS
  if (!manifest) throw new Error('Missing WEB_E2E_UI_INPUTS')
  const input = (relative: string) => path.join(runfiles, relative)
  const plan = JSON.parse(fs.readFileSync(input(manifest), 'utf8')) as {
    mode: 'compiled' | 'source'
    config: string
    tests: string[]
    playwright: string
  }
  let testPackage = path.dirname(fs.realpathSync(path.join(input(plan.playwright), 'package.json')))
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'web-e2e-ui-'))
  try {
    let config: string
    let cwd: string
    if (plan.mode === 'source') {
      const workspace = process.env.BUILD_WORKSPACE_DIRECTORY
      if (!workspace) throw new Error('Source UI mode requires bazel run from a workspace')
      config = path.join(workspace, plan.config)
      cwd = workspace
      testPackage = path.dirname(createRequire(pathToFileURL(config)).resolve('@playwright/test/package.json'))
    } else {
      const original = fs.realpathSync(input(plan.config))
      const tests = plan.tests.map(file => fs.realpathSync(input(file)))
      for (const module of [...tests, original]) {
        const resolved = createRequire(pathToFileURL(module)).resolve('@playwright/test/package.json')
        if (path.dirname(fs.realpathSync(resolved)) !== testPackage)
          throw new Error('UI specs and config must resolve the declared playwright runtime: ' + module)
      }
      config = path.join(scratch, 'playwright.config.mjs')
      fs.writeFileSync(config, aggregateConfig(original, tests))
      cwd = runfiles
    }
    const args = process.argv.slice(2)
    const child = spawn(process.execPath, [path.join(testPackage, 'cli.js'), 'test', '--config', config,
      ...(!args.includes('--list') && !args.includes('--help') && !args.includes('--ui') ? ['--ui'] : []), ...args], {
      cwd, stdio: 'inherit', env: {...process.env, JS_BINARY__PATCH_NODE_FS: '0'},
    })
    const interrupt = () => child.kill('SIGINT')
    const terminate = () => child.kill('SIGTERM')
    process.on('SIGINT', interrupt)
    process.on('SIGTERM', terminate)
    try {
      return await new Promise<number>((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 130 : 143)))
      })
    } finally {
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', terminate)
    }
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true})
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  launchUI().then(code => {process.exitCode = code}).catch(error => {console.error(error); process.exitCode = 1})
