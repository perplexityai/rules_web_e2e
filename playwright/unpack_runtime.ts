import fs from 'node:fs'
import fsExtra from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import * as tar from 'tar'
import {createRequire} from 'node:module'
const bzip = createRequire(import.meta.url)('seek-bzip') as {decode(input: Buffer): Buffer}
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
      let file = archive
      const fd = fs.openSync(archive, 'r'), header = Buffer.alloc(3)
      try { fs.readSync(fd, header, 0, 3, 0) } finally { fs.closeSync(fd) }
      if (header.toString() === 'BZh') {
        file = path.join(temporary, 'decoded.tar')
        fs.writeFileSync(file, bzip.decode(fs.readFileSync(archive)))
      }
      tar.x({file, cwd: root, sync: true, strict: true,
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
    for (const [source, target] of Object.entries(files).sort()) {
      const destination = path.join(output, target)
      if (fs.existsSync(destination)) throw new Error(`Additional runtime file would overwrite archive content: ${destination}`)
      if (fs.statSync(source).isDirectory()) {
        fsExtra.copySync(source, destination, {dereference: true})
        const normalize = (file: string) => {
          const stat = fs.statSync(file)
          fs.chmodSync(file, stat.isDirectory() || stat.mode & 0o111 ? 0o755 : 0o644)
          if (stat.isDirectory()) for (const name of fs.readdirSync(file)) normalize(path.join(file, name))
        }
        normalize(destination)
      } else copyFile(source, destination)
    }
  } finally { fs.rmSync(temporary, {recursive: true, force: true}) }
}
main(import.meta.url, () => process.argv[2] === '--manifest'
  ? assemble(readJson(process.argv[3]), process.argv[4])
  : assemble({archives: [process.argv[2]]}, process.argv[3]))
