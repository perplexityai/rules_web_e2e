import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

export function main(url: string, run: () => unknown | Promise<unknown>) {
  if (process.argv[1] && url === pathToFileURL(process.argv[1]).href) {
    // Bazel actions pass execpaths; js_binary launches inside its runfiles.
    if (process.env.JS_BINARY__EXECROOT && !process.env.TEST_SRCDIR)
      process.chdir(process.env.JS_BINARY__EXECROOT)
    Promise.resolve().then(run).catch(error => { console.error(error); process.exitCode = 1 })
  }
}
export const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'))
export function relative(value: string) {
  if (!value || path.isAbsolute(value) || value.split('/').some(p => !p || p === '.' || p === '..'))
    throw new Error(`Expected a relative runtime path without dot segments: ${value}`)
  return value
}
export function inside(root: string, file: string) {
  const rel = path.relative(root, file)
  return !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('../')
}
export function files(input: string): string[] {
  return fs.statSync(input).isDirectory()
    ? fs.readdirSync(input).flatMap(name => files(path.join(input, name))) : [input]
}
export function copyFile(source: string, target: string) {
  fs.mkdirSync(path.dirname(target), {recursive: true})
  fs.copyFileSync(source, target)
  fs.chmodSync(target, fs.statSync(source).mode & 0o111 ? 0o755 : 0o644)
}
