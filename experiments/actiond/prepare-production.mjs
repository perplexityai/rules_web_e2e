// Diagnostic preparation only: stage the actual Bazel-built production runners.
import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

const [work, bazelBin] = process.argv.slice(2).map(value => path.resolve(value))
if (!work || !bazelBin) throw new Error('usage: prepare-production.mjs WORK BAZEL_BIN')
const {stageRunfiles} = await import(pathToFileURL(path.join(bazelBin, 'external/rules_web_e2e+/runtime/isolation.js')))
for (const target of ['native_visual_test', 'component_visual_test']) {
  const directory = path.join(work, 'workspace', target)
  fs.rmSync(directory, {recursive: true, force: true})
  fs.mkdirSync(directory, {recursive: true})
  stageRunfiles(path.join(bazelBin, `${target}_/${target}.runfiles_manifest`), directory)
  const descriptorPath = path.join(directory, `_main/${target}_inputs.json`)
  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'))
  descriptor.browser = {
    root: '_runtime', executable: 'chromium/chrome-headless-shell', node: 'bin/node',
    libraryDirs: ['lib'], fontconfig: 'etc/fonts', arch: 'x64',
  }
  fs.chmodSync(descriptorPath, 0o644)
  fs.writeFileSync(descriptorPath, JSON.stringify(descriptor))
  const manifest = []
  const visit = relative => {
    const file = path.join(directory, relative)
    const stat = fs.lstatSync(file)
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file)) visit(path.join(relative, name))
    } else {
      manifest.push(`${relative} ${stat.isSymbolicLink() ? fs.readlinkSync(file) : `/workspace/${target}/${relative}`}`)
    }
  }
  visit('')
  manifest.push('_runtime /workspace/runtime')
  fs.writeFileSync(path.join(directory, 'MANIFEST'), manifest.join('\n') + '\n')
}
fs.copyFileSync(new URL('./production-smoke.mjs', import.meta.url), path.join(work, 'workspace', 'production-smoke.mjs'))
fs.copyFileSync(new URL('./capture.bzl', import.meta.url), path.join(work, 'workspace', 'capture.bzl'))
const build = path.join(work, 'workspace', 'BUILD.bazel')
const original = fs.readFileSync(new URL('./BUILD.bazel.template', import.meta.url), 'utf8')
fs.writeFileSync(build, 'load(":capture.bzl", "production")\n' + original + `
production(
    name = "production",
    node = "runtime/bin/node",
    script = "production-smoke.mjs",
    inputs = glob(["runtime/**", "native_visual_test/**", "component_visual_test/**"]),
    exec_properties = {"input-rootfs": "runtime"},
)
`)
