// Copy the real example workspace so .update can be tested without source edits.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const work = path.resolve(process.argv[2])
const repository = fileURLToPath(new URL('../../', import.meta.url))
const example = path.join(repository, 'examples/react')
const destination = path.join(work, 'public')
fs.mkdirSync(destination, {recursive: true})
for (const name of fs.readdirSync(example)) {
  if (name === 'node_modules' || name.startsWith('bazel-') || name.startsWith('.')) continue
  fs.cpSync(path.join(example, name), path.join(destination, name), {recursive: true})
}
const module = fs.readFileSync(path.join(destination, 'MODULE.bazel'), 'utf8')
fs.writeFileSync(path.join(destination, 'MODULE.bazel'), module.replace('path = "../.."', `path = ${JSON.stringify(repository)}`))
fs.copyFileSync(path.join(work, 'runtime.tar'), path.join(destination, 'runtime.tar'))
const build = path.join(destination, 'BUILD.bazel')
fs.writeFileSync(build,
  'load("@rules_web_e2e//playwright:archive.bzl", "browser_runtime_archive")\n' +
  'load("@rules_web_e2e//playwright:defs.bzl", "browser_runtime")\n' +
  fs.readFileSync(build, 'utf8') + `
browser_runtime_archive(name = "actiond_runtime_files", archive = "runtime.tar")
browser_runtime(
    name = "actiond_browser",
    root = ":actiond_runtime_files",
    executable = "chromium/chrome-headless-shell",
    node = "bin/node",
    library_dirs = ["lib"],
    fontconfig = "etc/fonts",
)
visual_test(
    name = "actiond_native_test",
    browser = ":actiond_browser",
    config = ":native_config",
    tests = ":native_visual_specs",
    baseline_dir = "__actiond_native__",
    baselines = glob(["__actiond_native__/*.png"], allow_empty = True),
)
component_visual_test(
    name = "actiond_gallery_test",
    browser = ":actiond_browser",
    shell = ":component_shell",
    matching = ":matching",
    baseline_dir = "__actiond_gallery__",
    baselines = glob(["__actiond_gallery__/*.png"], allow_empty = True),
)
`)
