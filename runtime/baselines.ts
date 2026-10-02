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
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error('Baseline destination must not traverse symlinks')
    }
  }
  return current
}

export function updateBaselines(generated: string, destination: string) {
  const names = fs.readdirSync(generated).filter(name => name.endsWith('.png'))
  if (!names.length)
    throw new Error(
      'Capture produced no screenshots; refusing to remove existing baselines'
    )
  const images = names.map(name => {
    const file = path.join(generated, name)
    if (!fs.lstatSync(file).isFile())
      throw new Error('Captured screenshots must be regular files')
    return [name, fs.readFileSync(file)] as const
  })
  fs.mkdirSync(destination, {recursive: true})
  for (const [name, bytes] of images) {
    // Rename a regular temporary file instead of following an existing symlink.
    const temp = path.join(destination, `.${name}.${process.pid}.tmp`)
    fs.writeFileSync(temp, bytes, {flag: 'wx'})
    fs.renameSync(temp, path.join(destination, name))
  }
  for (const name of fs.readdirSync(destination)) {
    if (name.endsWith('.png') && !names.includes(name))
      fs.unlinkSync(path.join(destination, name))
  }
}

export function baselineHashes(directory: string, followRunfileSymlinks = false): Record<string, string> {
  if (!fs.existsSync(directory)) return {}
  const stat = followRunfileSymlinks ? fs.statSync : fs.lstatSync
  if (!stat(directory).isDirectory())
    throw new Error('Baseline destination must be a directory')
  return Object.fromEntries(
    fs.readdirSync(directory).filter(name => name.endsWith('.png')).sort().map(name => {
      const file = path.join(directory, name)
      if (!stat(file).isFile())
        throw new Error('Existing screenshots must be regular files')
      return [name, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]
    })
  )
}

export function applyBaselineUpdate(
  generated: string,
  destination: string,
  before: Record<string, string>
) {
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
    if (JSON.stringify(baselineHashes(destination)) !== JSON.stringify(before))
      throw new Error('Baselines changed during capture; captured PNGs were not applied')
    updateBaselines(generated, destination)
  } finally {
    fs.rmdirSync(lock)
  }
}

/** Snapshots are owned working/output data, never links into the input tree. */
export function materializeSnapshots(source: string, destination: string): void {
  fs.mkdirSync(destination, {recursive: true})
  for (const name of fs.readdirSync(source)) {
    const input = path.join(source, name)
    const output = path.join(destination, name)
    if (fs.statSync(input).isDirectory()) materializeSnapshots(input, output)
    else fs.writeFileSync(output, fs.readFileSync(input), {flag: 'wx'})
  }
}
