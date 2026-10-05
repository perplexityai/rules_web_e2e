import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'

export function baselineDestination(workspace: string, relative: string) {
  if (
    !workspace ||
    !relative ||
    path.isAbsolute(relative) ||
    relative.split('/').some(p => !p || p === '.' || p === '..')
  ) {
    throw new Error(
      'Baseline destination must be a relative directory within the workspace'
    )
  }
  let current = path.resolve(workspace)
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    try {
      if (fs.lstatSync(current).isSymbolicLink())
        throw new Error('Baseline destination must not traverse symlinks')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return current
}

/** The Bazel writer owns this directory; never delete unrelated source files. */
export function validateBaselines(directory: string, requireImages = false) {
  const names = fs.existsSync(directory) ? fs.readdirSync(directory) : []
  if (names.some(name => !name.endsWith('.png') || !fs.lstatSync(path.join(directory, name)).isFile()))
    throw new Error('Baseline directory must contain only regular PNG files; move unrelated files outside it')
  if (requireImages && !names.length) throw new Error('Capture produced no screenshots')
}

export function baselineHashes(directory: string, followRunfileSymlinks = false, recursive = false): Record<string, string> {
  if (!fs.existsSync(directory)) return {}
  const stat = followRunfileSymlinks ? fs.statSync : fs.lstatSync
  if (!stat(directory).isDirectory()) throw new Error('Baseline destination must be a directory')
  const entries: [string, string][] = []
  for (const name of fs.readdirSync(directory).sort()) {
    const file = path.join(directory, name)
    if (recursive && stat(file).isDirectory()) {
      for (const [child, hash] of Object.entries(baselineHashes(file, followRunfileSymlinks, true)))
        entries.push([`${name}/${child}`, hash])
    } else if (recursive || name.endsWith('.png')) {
      if (!stat(file).isFile()) throw new Error('Existing screenshots must be regular files')
      entries.push([name, createHash('sha256').update(fs.readFileSync(file)).digest('hex')])
    }
  }
  return Object.fromEntries(entries)
}

/** Guard VRT and declared snapshot writers with the same edit/lock checks. */
export function withBaselineUpdate(destination: string, before: Record<string, string>, write: () => void, recursive = false) {
  const lock = destination + '.vrt-update.lock'
  fs.mkdirSync(path.dirname(destination), {recursive: true})
  try {
    fs.mkdirSync(lock)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error(`Baselines are already updating: ${destination}`)
    throw error
  }
  try {
    if (JSON.stringify(baselineHashes(destination, false, recursive)) !== JSON.stringify(before))
      throw new Error('Baselines changed during capture; captured PNGs were not applied')
    write()
  } finally {
    fs.rmdirSync(lock)
  }
}

/** Snapshots are owned working/output data, never links into the input tree. */
export function materializeSnapshots(source: string, destination: string, overwrite = false): void {
  fs.cpSync(source, destination, {recursive: true, dereference: true, force: overwrite, errorOnExist: !overwrite})
}
