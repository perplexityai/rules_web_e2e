import fs from 'node:fs'
import path from 'node:path'

/** Map logical names to declared artifacts without copying or repairing packages. */
export function linkRunfiles(files: Record<string, string>, destination: string): void {
  destination = path.resolve(destination)
  fs.mkdirSync(destination, {recursive: true})
  for (const [name, source] of Object.entries(files)) {
    const target = path.resolve(destination, name)
    if (!target.startsWith(destination + path.sep))
      throw new Error(`Invalid runfile: ${name}`)
    // Never create entries through a link into a caller-owned directory.
    for (let parent = path.dirname(target); parent !== destination; parent = path.dirname(parent)) {
      if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink())
        throw new Error(`Overlapping runfile declarations: ${name}`)
    }
    fs.mkdirSync(path.dirname(target), {recursive: true})
    fs.symlinkSync(path.resolve(source), target)
  }
}

/** Remove private scratch space without following links into declared inputs. */
export function removeScratch(directory: string): void {
  const mode = fs.statSync(directory).mode
  if ((mode & 0o300) !== 0o300) fs.chmodSync(directory, mode | 0o300)
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const child = path.join(directory, entry.name)
    if (entry.isDirectory()) removeScratch(child)
    else fs.unlinkSync(child)
  }
  fs.rmdirSync(directory)
}

/** Caller variables reach fixtures only when explicitly declared by the target. */
export function testEnvironment(
  source: NodeJS.ProcessEnv,
  names: string[],
  temp: string
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const name of names)
    if (source[name] !== undefined) env[name] = source[name]
  for (const name of ['HOME', 'TMPDIR', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME']) {
    env[name] = path.join(temp, name.toLowerCase())
    fs.mkdirSync(env[name]!, {recursive: true})
  }
  return {
    ...env,
    CI: '1',
    TZ: 'UTC',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
  }
}
