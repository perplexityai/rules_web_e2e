import fs from 'node:fs'
import path from 'node:path'

process.chdir(process.env.JS_BINARY__EXECROOT)
for (const spec of JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))) {
  const content = fs.readFileSync(spec.input, 'utf8')
  const reference = [...content.matchAll(/\/\/# sourceMappingURL=(.+)/g)].at(-1)?.[1].trim()
  let sources = [spec.input]
  if (reference) {
    const inline = reference.startsWith('data:')
    const mapFile = inline ? spec.input : path.join(path.dirname(spec.input), reference)
    const map = JSON.parse(inline ? Buffer.from(reference.split(',')[1], 'base64').toString() : fs.readFileSync(mapFile, 'utf8'))
    sources = map.sources.map(source => path.join(path.dirname(mapFile), map.sourceRoot || '', source))
  }
  // UI file filters use source locations; imported specs keep their own mappings.
  const map = {version: 3, sources: sources.map(source => path.relative(path.dirname(spec.destination), source)), names: [], mappings: ''}
  const encoded = Buffer.from(JSON.stringify(map)).toString('base64')
  fs.writeFileSync(spec.output, `import { importModule } from ${JSON.stringify(spec.helper)};\nawait importModule(${JSON.stringify(spec.runfile)});\n//# sourceMappingURL=data:application/json;base64,${encoded}\n`)
}
