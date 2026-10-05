import fs from 'node:fs'
import path from 'node:path'

/** Chromium's profile socket exceeds the Unix path limit under deep Bazel temp roots. */
export function browserTempRoot(requested: string, platform = process.platform): string {
  return platform !== 'win32' && Buffer.byteLength(requested) > 40
    ? '/tmp'
    : requested
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
    // The local bundle intentionally excludes host locale archives.
    LANG: source.VRT_EXECUTION === 'local' ? 'C' : 'C.UTF-8',
    LC_ALL: source.VRT_EXECUTION === 'local' ? 'C' : 'C.UTF-8',
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
  }
}
