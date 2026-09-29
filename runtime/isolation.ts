import fs from 'node:fs'
import path from 'node:path'

/** Materialize exactly the runfiles manifest, preserving npm's internal links. */
export function stageRunfiles(manifest: string, destination: string): void {
  const decode = (value: string) =>
    value.replace(
      /\\([snb])/g,
      (_, code: string) => ({s: ' ', n: '\n', b: '\\'})[code]!
    )
  const entries = fs.readFileSync(manifest, 'utf8').split('\n').filter(Boolean).map(line => {
    const escaped = line.startsWith(' ')
    if (escaped) line = line.slice(1)
    const separator = line.indexOf(' ')
    const name = escaped
      ? decode(line.slice(0, separator))
      : line.slice(0, separator)
    const source = escaped
      ? decode(line.slice(separator + 1))
      : line.slice(separator + 1)
    return {name, source}
  })
  const sources = new Map(entries.map(({name, source}) => [path.resolve(destination, name), source]))
  // Check declarations, not copy order: a package-store target may appear later.
  const sameDeclaredFile = (target: string, source: string) => {
    const realSource = fs.realpathSync(source)
    for (let parent = target; parent.startsWith(destination + path.sep); parent = path.dirname(parent)) {
      const declared = sources.get(parent)
      if (!declared || !path.isAbsolute(declared)) continue
      const candidate = path.join(declared, path.relative(parent, target))
      if (fs.existsSync(candidate) && fs.realpathSync(candidate) === realSource) return true
    }
    return false
  }
  for (const {name, source} of entries) {
    const target = path.resolve(destination, name)
    if (!target.startsWith(destination + path.sep))
      throw new Error(`Invalid runfile: ${name}`)
    fs.mkdirSync(path.dirname(target), {recursive: true})
    if (!source) fs.writeFileSync(target, '')
    else if (!path.isAbsolute(source)) {
      if (
        !path
          .resolve(path.dirname(target), source)
          .startsWith(destination + path.sep)
      )
        throw new Error(`Runfile link escapes staged inputs: ${name}`)
      fs.symlinkSync(source, target)
    } else {
      // pnpm's nested package links must keep their package-store identity so
      // Node finds dependencies beside the real package, not beside its alias.
      const link = fs.existsSync(source) && fs.lstatSync(source).isSymbolicLink()
        ? fs.readlinkSync(source)
        : null
      if (link && !path.isAbsolute(link) && sameDeclaredFile(path.resolve(path.dirname(target), link), source))
        fs.symlinkSync(link, target)
      else fs.cpSync(source, target, {recursive: true, dereference: true})
    }
  }
}

/** Remove staged copies, including directories copied from read-only CAS inputs. */
export function removeStagedTemp(directory: string): void {
  const mode = fs.statSync(directory).mode
  if ((mode & 0o300) !== 0o300) fs.chmodSync(directory, mode | 0o300)
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const child = path.join(directory, entry.name)
    if (entry.isDirectory()) removeStagedTemp(child)
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
