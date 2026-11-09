import fs from 'node:fs'
import path from 'node:path'

const MISSING = /Cannot find (?:package|module) '([^']+)'(?: imported from (\S+))?/
const REQUIRE_STACK = /^\s*- (\/\S+)/
const MAX_ENTRIES = 8

function packageName(specifier: string): string {
  const parts = specifier.split('/')
  return parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
}

function packageRoot(file: string): string | undefined {
  const parts = file.split(path.sep)
  const index = parts.lastIndexOf('node_modules')
  if (index < 0 || index + 1 >= parts.length) return undefined
  const end = parts[index + 1].startsWith('@') ? index + 3 : index + 2
  return end <= parts.length ? parts.slice(0, end).join(path.sep) : undefined
}

// Mirror Node's node_modules lookup so a bare specifier names the link it found.
function nearestPackage(specifier: string, importer: string): string {
  const name = packageName(specifier)
  let directory = path.dirname(importer)
  let first: string | undefined
  for (;;) {
    const candidate = path.join(directory, 'node_modules', name)
    first ??= candidate
    try {
      fs.lstatSync(candidate)
      return candidate
    } catch {}
    const parent = path.dirname(directory)
    if (parent === directory) return first
    directory = parent
  }
}

// Test processes report only where module resolution stopped. Collect those
// package locations from ESM and CommonJS errors in the child's output.
export class MissingModules {
  readonly roots = new Set<string>()
  private pending?: string
  private stack = false

  observe(line: string): void {
    const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
    const missing = MISSING.exec(plain)
    if (missing) {
      const [, specifier, importer] = missing
      this.pending = undefined
      this.stack = false
      if (path.isAbsolute(specifier)) this.add(packageRoot(specifier))
      else if (importer && path.isAbsolute(importer)) this.add(nearestPackage(specifier, importer))
      else if (!specifier.startsWith('.')) this.pending = specifier
      return
    }
    if (!this.pending) return
    if (/^\s*Require stack:/.test(plain)) {
      this.stack = true
      return
    }
    const importer = this.stack ? REQUIRE_STACK.exec(plain)?.[1] : undefined
    if (importer) this.add(nearestPackage(this.pending, importer))
    this.pending = undefined
    this.stack = false
  }

  private add(root: string | undefined) {
    if (root) this.roots.add(root)
  }
}

function describeEntry(file: string): string {
  try {
    const stat = fs.lstatSync(file)
    if (stat.isSymbolicLink())
      return `symlink -> ${fs.readlinkSync(file)}${fs.existsSync(file) ? '' : ' (target missing)'}`
    if (stat.isDirectory()) return 'directory'
    return `file (${stat.size} bytes)`
  } catch (error) {
    return (error as NodeJS.ErrnoException).code || String(error)
  }
}

function describeRoot(label: string, root: string): string[] {
  const lines = [`${label} ${root}: ${describeEntry(root)}`]
  let real: string
  try {
    real = fs.realpathSync(root)
  } catch (error) {
    return [...lines, `  realpath: ${(error as NodeJS.ErrnoException).code || error}`]
  }
  lines.push(`  realpath: ${real}`)
  try {
    const entries = fs.readdirSync(real).sort()
    const shown = entries.slice(0, MAX_ENTRIES).join(', ')
    lines.push(`  entries (${entries.length})${shown ? `: ${shown}` : ''}${entries.length > MAX_ENTRIES ? ', ...' : ''}`)
  } catch (error) {
    lines.push(`  entries: ${(error as NodeJS.ErrnoException).code || error}`)
  }
  lines.push(`  package.json: ${describeEntry(path.join(real, 'package.json'))}`)
  return lines
}

// Report each package both where Node looked and in the test's runfiles, so a
// missing declared input can be told apart from stale or partial execroot state.
export function describeMissingModules(roots: Iterable<string>, runfilesWorkspace: string): string {
  const lines: string[] = []
  for (const root of roots) {
    lines.push(...describeRoot('resolved', root))
    const parts = root.split(path.sep)
    const out = parts.indexOf('bazel-out')
    if (out < 0 || parts[out + 2] !== 'bin') continue
    const runfiles = path.join(runfilesWorkspace, ...parts.slice(out + 3))
    if (runfiles !== root) lines.push(...describeRoot('runfiles', runfiles))
  }
  return lines.length ? ['Module resolution diagnostics:', ...lines].join('\n') : ''
}
