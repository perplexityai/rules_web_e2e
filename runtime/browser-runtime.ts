import fs from 'node:fs'
import path from 'node:path'

export interface BrowserRuntime {
  root: string
  executable: string
  node: string
  libraryDirs: string[]
  fontconfig: string
  arch: 'x64' | 'arm64'
}

/** Resolve only declared runtime files; never fall back to a host browser. */
export function browserRuntime(inputs: string, runtime: BrowserRuntime) {
  if (process.platform !== 'linux' || process.arch !== runtime.arch)
    throw new Error(`Browser runtime requires Linux ${runtime.arch}; select a matching execution platform`)
  const root = fs.realpathSync(path.join(inputs, runtime.root))
  const resolve = (relative: string) => {
    if (!relative || path.isAbsolute(relative) || relative.split('/').some(p => !p || p === '.' || p === '..'))
      throw new Error(`Invalid browser runtime path: ${relative}`)
    const file = fs.realpathSync(path.join(root, relative))
    if (!file.startsWith(root + path.sep))
      throw new Error(`Browser runtime path escapes declared root: ${relative}`)
    return file
  }
  return {
    node: resolve(runtime.node),
    env: {
      VRT_CHROMIUM_EXECUTABLE: resolve(runtime.executable),
      LD_LIBRARY_PATH: runtime.libraryDirs.map(resolve).join(path.delimiter),
      FONTCONFIG_PATH: resolve(runtime.fontconfig),
    },
  }
}
