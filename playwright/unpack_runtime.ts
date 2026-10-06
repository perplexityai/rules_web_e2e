import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as tar from 'tar'
import {copyFile, inside, main, readJson, relative} from '../tools/files.js'

function materialize(root: string, source: string, target: string, parents = new Set<string>()) {
  let resolved: string
  try { resolved = fs.realpathSync(source) }
  catch { throw new Error(`Runtime contains a dangling link: ${path.relative(root, source)}`) }
  if (!inside(root, resolved)) throw new Error(`Runtime link escapes archive root: ${source}`)
  if (fs.statSync(resolved).isDirectory()) {
    if (parents.has(resolved)) throw new Error(`Runtime contains a directory link cycle: ${source}`)
    fs.mkdirSync(target, {recursive: true})
    for (const name of fs.readdirSync(resolved).sort())
      materialize(root, path.join(resolved, name), path.join(target, name), new Set([...parents, resolved]))
  } else if (fs.statSync(resolved).isFile()) copyFile(resolved, target)
  else throw new Error(`Runtime contains an unsupported file: ${source}`)
}
export interface ArchiveManifest {
  archives: string[]
  paths?: Record<string, string>
  files?: Record<string, string>
  exclude?: string[]
}
export function assemble({archives, paths = {}, files = {}, exclude = []}: ArchiveManifest, output: string) {
  exclude.forEach(relative)
  const destinations = [...Object.values(paths), ...Object.values(files)].map(relative)
  destinations.forEach((value, index) => {
    if (destinations.slice(0, index).some(other => inside(other, value) || inside(value, other)))
      throw new Error(`Overlapping runtime output paths: ${value}`)
  })
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-unpack-')))
  const root = path.join(temporary, 'root')
  fs.mkdirSync(root)
  try {
    for (const archive of archives) {
      tar.x({file: archive, cwd: root, sync: true, strict: true,
      filter: (name, entry) => {
        if (!(entry instanceof tar.ReadEntry)) throw new Error("Expected archive entry")
        if (name.startsWith('/') || name.split('/').includes('..'))
          throw new Error(`Runtime archive path escapes archive root: ${name}`)
        if (path.posix.basename(name).startsWith('.wh.')) throw new Error('Runtime filesystem archives must not contain whiteouts')
        if (!['File', 'OldFile', 'Directory', 'SymbolicLink', 'Link'].includes(entry.type))
          throw new Error(`Runtime contains an unsupported file: ${name}`)
        if (entry.linkpath?.startsWith('/')) {
          const target = path.posix.normalize(entry.linkpath).replace(/^\/+/, '') || '.'
          entry.linkpath = entry.type === 'SymbolicLink'
            ? path.posix.relative(path.posix.dirname(name), target) || '.' : target
        }
        if (entry.linkpath && !inside(root, path.resolve(root, entry.type === 'SymbolicLink' ? path.dirname(name) : '.', entry.linkpath)))
          throw new Error(`Runtime link escapes archive root: ${name}`)
        const normalized = path.posix.normalize(name)
        return !exclude.some(p => normalized === p || normalized.startsWith(p + '/'))
      },
      })
    }
    if (Object.keys(paths).length) {
      for (const [source, target] of Object.entries(paths).sort())
        materialize(root, path.join(root, relative(source)), path.join(output, target))
    } else materialize(root, root, output)
    // Bazel copies declared files after this action. Validate their destinations
    // against the normalized archive without reading those inputs here.
    for (const target of Object.values(files)) {
      const destination = path.join(output, target)
      if (fs.existsSync(destination)) throw new Error(`Additional runtime file would overwrite archive content: ${destination}`)
    }
  } finally { fs.rmSync(temporary, {recursive: true, force: true}) }
}
main(import.meta.url, () => process.argv[2] === '--manifest'
  ? assemble(readJson(process.argv[3]), process.argv[4])
  : assemble({archives: [process.argv[2]]}, process.argv[3]))
