import fs from 'node:fs'
import path from 'node:path'

// Each action owns its /tmp namespace. A short interpreter path fits existing
// ELF PT_INTERP segments without moving loadable segments or changing offsets.
export const runtimeDirectory = '/tmp/rules-web-vrt'
const interpreter = Buffer.from(`${runtimeDirectory}/ld.so\0`)

/** Rewrite executable lookup paths, leaving ELF loadable segments untouched. */
export function relocateExecutable(data: Buffer): Buffer | undefined {
  if (data.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    if (data.length < 64 || data[4] !== 2 || data[5] !== 1)
      throw new Error('VRT relocation requires a little-endian ELF64 executable')
    const table = Number(data.readBigUInt64LE(32))
    const size = data.readUInt16LE(54)
    const count = data.readUInt16LE(56)
    if (!Number.isSafeInteger(table) || size < 56 || table < 64 || table + size * count > data.length)
      throw new Error('Invalid ELF program-header table')
    for (let index = 0; index < count; index++) {
      const header = table + index * size
      if (data.readUInt32LE(header) !== 3) continue
      const offset = Number(data.readBigUInt64LE(header + 8))
      const length = Number(data.readBigUInt64LE(header + 32))
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || offset + length > data.length)
        throw new Error('Invalid ELF interpreter segment')
      if (length < interpreter.length)
        throw new Error('ELF interpreter segment is too short for VRT relocation')
      const result = Buffer.from(data)
      result.fill(0, offset, offset + length)
      interpreter.copy(result, offset)
      return result
    }
    return undefined
  }
  if (data.subarray(0, 2).toString() !== '#!') return undefined
  const end = data.indexOf(10)
  if (end < 0) return undefined
  const line = data.subarray(2, end).toString().trim()
  const match = /^(?:\/usr\/bin\/env\s+|\/(?:usr\/)?bin\/)(bash|sh|node)$/.exec(line)
  if (!match) return undefined
  const executable = match[1] === 'node' ? 'node' : 'bash'
  return Buffer.concat([Buffer.from(`#!${runtimeDirectory}/${executable}\n`), data.subarray(end + 1)])
}

function relocateFile(file: string) {
  const mode = fs.statSync(file).mode
  if (!(mode & 0o111)) return
  const data = fs.readFileSync(file)
  const relocated = relocateExecutable(data)
  if (!relocated) return
  fs.chmodSync(file, mode | 0o200)
  fs.writeFileSync(file, relocated)
  fs.chmodSync(file, mode)
}

/** Only staged copies are changed; declared CAS inputs remain immutable. */
export function relocateInputs(directory: string): void {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) relocateInputs(file)
    else if (entry.isFile()) relocateFile(file)
  }
}

export function bootstrapRuntime(runtime: {
  path: string; loader: string; node: string; bash: string; libraryDirs: string[]
}) {
  const root = fs.realpathSync(runtime.path)
  const resolve = (relative: string) => {
    if (!relative || path.isAbsolute(relative) || relative.split('/').some(p => !p || p === '.' || p === '..'))
      throw new Error(`Invalid runtime path: ${relative}`)
    const file = fs.realpathSync(path.join(root, relative))
    if (!file.startsWith(root + path.sep)) throw new Error(`Runtime path escapes declared root: ${relative}`)
    return file
  }
  fs.mkdirSync(runtimeDirectory)
  for (const [name, source] of [['ld.so', runtime.loader], ['node', runtime.node], ['bash', runtime.bash]]) {
    const output = path.join(runtimeDirectory, name)
    fs.copyFileSync(resolve(source), output)
    fs.chmodSync(output, 0o755)
    if (name !== 'ld.so') relocateFile(output)
  }
  return {
    node: path.join(runtimeDirectory, 'node'),
    libraryPath: runtime.libraryDirs.map(resolve).join(path.delimiter),
  }
}
