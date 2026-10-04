import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {baselineDestination} from './baselines.js'

function rejectSymlinks(file: string) {
  let current = path.parse(file).root
  for (const part of path.relative(current, file).split(path.sep)) {
    current = path.join(current, part)
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Snapshot destination must not traverse symlinks')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

function snapshotFiles(directory: string, prefix = ''): string[] {
  if (!fs.existsSync(directory)) return []
  if (!fs.lstatSync(directory).isDirectory()) throw new Error('Snapshot directory must not be a symlink')
  return fs.readdirSync(directory).sort().flatMap(name => {
    const relative = prefix ? `${prefix}/${name}` : name
    const file = path.join(directory, name)
    const stat = fs.lstatSync(file)
    if (stat.isDirectory()) return snapshotFiles(file, relative)
    if (!stat.isFile()) throw new Error('Snapshots must contain only regular files and directories')
    return [relative]
  })
}

export function snapshotHashes(directory: string): Record<string, string> {
  return Object.fromEntries(snapshotFiles(directory).map(name => [
    name, createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex'),
  ]))
}

/** Apply selected captures only; unselected baselines stay intact. */
export function applySnapshotUpdate(generated: string, destination: string, before: Record<string, string>) {
  const names = snapshotFiles(generated)
  if (!names.length) throw new Error('Capture produced no snapshots; nothing was applied')
  const captures = names.map(name => ({name, bytes: fs.readFileSync(path.join(generated, name))}))
  // Recheck ancestors after capture, before creating directories or taking a lock.
  rejectSymlinks(destination)
  fs.mkdirSync(path.dirname(destination), {recursive: true})
  const lock = destination + '.snapshot-update.lock'
  try { fs.mkdirSync(lock) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Snapshots are already updating: ${destination}`)
    throw error
  }
  try {
    if (JSON.stringify(snapshotHashes(destination)) !== JSON.stringify(before))
      throw new Error('Snapshots changed during capture; nothing was applied')
    for (const {name, bytes} of captures) {
      const target = baselineDestination(destination, name)
      fs.mkdirSync(path.dirname(target), {recursive: true})
      const temp = `${target}.${process.pid}.tmp`
      let created = false
      try {
        fs.writeFileSync(temp, bytes, {flag: 'wx'})
        created = true
        fs.renameSync(temp, target)
      } finally {
        if (created && fs.existsSync(temp)) fs.unlinkSync(temp)
      }
    }
  } finally { fs.rmdirSync(lock) }
}
