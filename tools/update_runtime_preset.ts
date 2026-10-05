import fs from 'node:fs'
import {main, readJson} from './files.js'

export function exportPreset(lockfile: string, output: string) {
  const resolved = Object.entries(readJson(lockfile).moduleExtensions)
    .filter(([name]) => name.endsWith('%apt'))
    .flatMap(([, configs]) => Object.values(configs as Record<string, any>))
    .flatMap(config => config.generatedRepoSpecs?.vrt_noble ? [JSON.parse(config.generatedRepoSpecs.vrt_noble.attributes.lock_content)] : [])
  if (resolved.length !== 1) throw new Error('Expected one vrt_noble APT resolution; run Bazel 9 mod deps in tools/runtime-preset')
  const data = resolved[0]
  const packages = new Map<string, unknown>()
  for (const pkg of Object.values(data.packages) as any[]) {
    const entry = {name: pkg.name, version: pkg.version, sha256: pkg.sha256,
      urls: data.sources[pkg.suite].uris.map((uri: string) => uri + '/' + pkg.filename)}
    if (packages.has(pkg.name) && JSON.stringify(packages.get(pkg.name)) !== JSON.stringify(entry))
      throw new Error(`Conflicting versions of ${pkg.name}; review the APT closure`)
    packages.set(pkg.name, entry)
  }
  fs.writeFileSync(output, JSON.stringify({packages: [...packages.keys()].sort().map(key => packages.get(key))}, null, 2) + '\n')
}
main(import.meta.url, () => {
  if (process.env.BUILD_WORKSPACE_DIRECTORY) process.chdir(process.env.BUILD_WORKSPACE_DIRECTORY)
  exportPreset(process.argv[2], process.argv[3])
})
