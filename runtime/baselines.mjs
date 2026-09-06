import fs from 'node:fs'
import path from 'node:path'

export function baselineDestination(workspace, relative) {
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

export function updateBaselines(generated, destination) {
  const names = fs.readdirSync(generated).filter(name => name.endsWith('.png'))
  if (!names.length)
    throw new Error(
      'Capture produced no screenshots; refusing to remove existing baselines'
    )
  const images = names.map(name => {
    const file = path.join(generated, name)
    if (!fs.lstatSync(file).isFile())
      throw new Error('Captured screenshots must be regular files')
    return [name, fs.readFileSync(file)]
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
