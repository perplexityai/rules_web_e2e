import path from 'node:path'
import {pathToFileURL} from 'node:url'

const root = process.env.RUNFILES_DIR || process.env.JS_BINARY__RUNFILES
if (!root) throw new Error('Playwright UI requires Bazel runfiles')
const bundle = path.join(root, %{bundle})
const {playwrightCli} = await import(pathToFileURL(path.join(bundle, 'runfiles.mjs')).href)
const args = process.argv.slice(2)
process.chdir(path.join(root, process.env.JS_BINARY__WORKSPACE || '_main'))
process.argv = [
  process.execPath, playwrightCli, 'test', '--config', path.join(bundle, 'playwright.config.mjs'),
  ...(!args.includes('--list') && !args.includes('--help') && !args.includes('--ui') ? ['--ui'] : []),
  ...args,
]
await import(pathToFileURL(playwrightCli).href)
