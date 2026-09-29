import fs from 'node:fs'
import path from 'node:path'

/** Materialize exactly the runfiles manifest, preserving npm's internal links. */
export function stageRunfiles(manifest: string, destination: string): void {
  const decode = (value: string) =>
    value.replace(
      /\\([snb])/g,
      (_, code: string) => ({s: ' ', n: '\n', b: '\\'})[code]!
    )
  for (let line of fs.readFileSync(manifest, 'utf8').split('\n')) {
    if (!line) continue
    const escaped = line.startsWith(' ')
    if (escaped) line = line.slice(1)
    const separator = line.indexOf(' ')
    const name = escaped
      ? decode(line.slice(0, separator))
      : line.slice(0, separator)
    const source = escaped
      ? decode(line.slice(separator + 1))
      : line.slice(separator + 1)
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
      try {
        fs.cpSync(source, target, {recursive: true, dereference: true})
      } catch (error) {
        // npm can declare platform-specific optional package links that have no
        // target on this platform. Keep failing for every other missing runfile.
        const danglingLink =
          fs.lstatSync(source, {throwIfNoEntry: false})?.isSymbolicLink() &&
          !fs.existsSync(source)
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !danglingLink)
          throw error
      }
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
