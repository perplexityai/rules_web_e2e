import fs from 'node:fs'
import path from 'node:path'

/** Preserve an explicitly provisioned cache across the clean fixture environment. */
export function hostBrowserEnvironment(
  directory: string | undefined,
  root = process.cwd()
): NodeJS.ProcessEnv {
  const resolved =
    directory && directory !== '0' ? path.resolve(root, directory) : undefined
  if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory())
    throw new Error(
      'Browser tests require PLAYWRIGHT_BROWSERS_PATH pointing to a provisioned browser directory (absolute or relative to Bazel runfiles). ' +
        'Install Chromium with the selected Playwright version before running Bazel tests.'
    )
  return {
    PLAYWRIGHT_BROWSERS_PATH: resolved,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
  }
}
