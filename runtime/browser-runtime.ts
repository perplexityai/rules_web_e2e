import fs from 'node:fs'
import path from 'node:path'

export interface BrowserRuntime {
  root: string
  executable: string
  node: string
  ffmpeg?: string
  libraryDirs: string[]
  fontconfig: string
  arch: 'x64' | 'arm64'
}

// actiond mounts its checksum-pinned glibc 2.39 at standard ELF paths. Prefer
// those libraries to any libc bundled with the browser, so loader and libc match.
export const workerLibraryPath = [
  '/lib/x86_64-linux-gnu', '/lib/aarch64-linux-gnu', '/lib64', '/lib',
  '/usr/lib/x86_64-linux-gnu', '/usr/lib/aarch64-linux-gnu', '/usr/lib',
].join(path.delimiter)

/** Stage the declared helper at the revision selected by Playwright. */
export function stageFfmpeg(core: string, executable: string, cacheHome: string): void {
  const registry = JSON.parse(fs.readFileSync(path.join(core, 'browsers.json'), 'utf8')) as {
    browsers: {name: string; revision?: string; revisionOverrides?: Record<string, string>}[]
  }
  const entry = registry.browsers.find(browser => browser.name === 'ffmpeg')
  if (!entry?.revision || !/^\d+$/.test(entry.revision) || entry.revisionOverrides)
    throw new Error('Playwright must declare one platform-independent FFmpeg revision')
  const directory = path.join(cacheHome, 'ms-playwright', `ffmpeg-${entry.revision}`)
  fs.mkdirSync(directory, {recursive: true})
  fs.symlinkSync(executable, path.join(directory, 'ffmpeg-linux'))
}

/** Resolve only declared runtime files; never fall back to a host browser. */
export function browserRuntime(inputs: string, runtime: BrowserRuntime, host = false) {
  if (process.platform !== 'linux' || process.arch !== runtime.arch)
    throw new Error(`Browser runtime requires Linux ${runtime.arch}; select a matching execution platform`)
  const root = fs.realpathSync(path.join(inputs, runtime.root))
  const resolve = (relative: string) => {
    if (!relative || path.isAbsolute(relative) || relative.split('/').some(p => !p || p === '.' || p === '..'))
      throw new Error(`Invalid browser runtime path: ${relative}`)
    const file = fs.realpathSync(path.join(root, relative))
    if (!host && !file.startsWith(root + path.sep))
      throw new Error(`Browser runtime path escapes declared root: ${relative}`)
    return file
  }
  return {
    node: resolve(runtime.node),
    ...(runtime.ffmpeg ? {ffmpeg: resolve(runtime.ffmpeg)} : {}),
    env: {
      VRT_CHROMIUM_EXECUTABLE: resolve(runtime.executable),
      LD_LIBRARY_PATH: workerLibraryPath + path.delimiter + runtime.libraryDirs.map(resolve).join(path.delimiter),
      FONTCONFIG_PATH: resolve(runtime.fontconfig),
    },
  }
}
