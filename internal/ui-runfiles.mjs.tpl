import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'

const root = process.env.RUNFILES_DIR || process.env.JS_BINARY__RUNFILES
if (!root) throw new Error('Playwright UI requires Bazel runfiles')

export function resolveRunfile(relative) {
  return path.join(root, relative)
}

const testPackage = path.dirname(fs.realpathSync(path.join(resolveRunfile(%{playwright}), 'package.json')))
export const playwrightCli = path.join(testPackage, 'cli.js')

export async function importModule(relative) {
  const file = fs.realpathSync(resolveRunfile(relative))
  const resolved = createRequire(pathToFileURL(file)).resolve('@playwright/test/package.json')
  if (path.dirname(fs.realpathSync(resolved)) !== testPackage)
    throw new Error('UI specs and config must resolve the declared playwright runtime: ' + file)
  return import(pathToFileURL(file).href)
}
