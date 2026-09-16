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
for (const name of ['isolation', 'failure'])
  fs.copyFileSync(new URL(`./${name}.visual.spec.ts`, import.meta.url), path.join(destination, `actiond-${name}.visual.spec.ts`))
fs.writeFileSync(path.join(destination, 'actiond-isolation.spec.ts'), fs.readFileSync(new URL('./isolation.visual.spec.ts', import.meta.url), 'utf8').replace("['/bin/bash', '/bin/sh', '/usr/bin/env', '/lib64/ld-linux-x86-64.so.2', '/lib/ld-linux-aarch64.so.1']", "['/bin/sh', '/lib64/ld-linux-x86-64.so.2', '/lib/ld-linux-aarch64.so.1']"))
fs.writeFileSync(path.join(destination, 'actiond-browser-failure.spec.ts'), `
import {test} from '@playwright/test'
test('ordinary failure reaches Bazel', async ({page}) => {
  await page.goto('/')
  console.log('BROWSER_EXECUTION ' + await page.evaluate(() => crypto.randomUUID()))
  throw new Error('Intentional ordinary browser failure')
})
`)
fs.writeFileSync(path.join(destination, 'actiond-rerun.spec.ts'), `
import {expect, test} from '@playwright/test'
test('Bazel launches a new browser for each run', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Save', exact: true})).toBeVisible()
  expect(['1', '2']).toContain(process.env.TEST_RUN_NUMBER)
  console.log('BROWSER_EXECUTION ' + await page.evaluate(() => crypto.randomUUID()))
})
`)
const build = path.join(destination, 'BUILD.bazel')
fs.writeFileSync(build,
  'load("@rules_web_e2e//playwright:archive.bzl", "browser_runtime_archive")\n' +
  'load("@rules_web_e2e//playwright:defs.bzl", "browser_runtime")\n' +
  fs.readFileSync(build, 'utf8') + `
js_library(
    name = "actiond_rerun_specs",
    srcs = ["actiond-rerun.spec.js"],
    deps = [":typecheck_project"],
)
web_e2e_test(
    name = "actiond_rerun_test",
    browser = ":actiond_browser",
    config = ":native_config",
    tests = ":actiond_rerun_specs",
)
web_e2e_test(
    name = "actiond_e2e_test",
    browser = ":actiond_browser",
    shell = ":app_shell",
    tests = ":e2e_specs",
)
component_browser_test(
    name = "actiond_component_test",
    browser = ":actiond_browser",
    shell = ":component_shell",
    tests = ":component_specs",
)
js_library(
    name = "actiond_browser_isolation_specs",
    srcs = ["actiond-isolation.spec.js"],
    deps = [":typecheck_project"],
)
web_e2e_test(
    name = "actiond_browser_isolation_test",
    browser = ":actiond_browser",
    config = ":native_config",
    tests = ":actiond_browser_isolation_specs",
    data = [":actiond_fixture_server", "package.json"],
    env = {
        "EXAMPLE_SERVER_COMMAND": "$(rootpath :actiond_fixture_server)",
        "ACTIOND_FIXTURE": json.encode({"package": "$(rootpath package.json)"}),
    },
)
js_library(
    name = "actiond_browser_failure_specs",
    srcs = ["actiond-browser-failure.spec.js"],
    deps = [":typecheck_project"],
)
web_e2e_test(
    name = "actiond_browser_failure_test",
    browser = ":actiond_browser",
    config = ":native_config",
    tests = ":actiond_browser_failure_specs",
)
js_binary(
    name = "actiond_fixture_server",
    entry_point = "native-server.js",
    data = [":typecheck_project", "package.json"],
)
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
    name = "actiond_local_rejection_test",
    browser = ":actiond_browser",
    config = ":native_config",
    tests = ":native_visual_specs",
    baseline_dir = "__actiond_local_rejection__",
)
visual_test(
    name = "actiond_native_test",
    browser = ":actiond_browser",
    config = ":native_config",
    tests = ":native_visual_specs",
    data = [":actiond_fixture_server"],
    env = {"EXAMPLE_SERVER_COMMAND": "$(rootpath :actiond_fixture_server)"},
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
js_library(
    name = "actiond_isolation_specs",
    srcs = ["actiond-isolation.visual.spec.js"],
    deps = [":typecheck_project"],
)
js_library(
    name = "actiond_failure_specs",
    srcs = ["actiond-failure.visual.spec.js"],
    deps = [":typecheck_project"],
)
visual_test(
    name = "actiond_isolation_test",
    browser = ":actiond_browser",
    config = ":native_config",
    tests = ":actiond_isolation_specs",
    baseline_dir = "__actiond_isolation__",
    data = ["package.json"],
    env = {"ACTIOND_FIXTURE": json.encode({"package": "$(rootpath package.json)"})},
)
visual_test(
    name = "actiond_failure_test",
    browser = ":actiond_browser",
    config = ":native_config",
    tests = ":actiond_failure_specs",
    baseline_dir = "__actiond_failed__",
    baselines = glob(["__actiond_failed__/*.png"], allow_empty = True),
)
visual_test(
    name = "actiond_timeout_test",
    browser = ":actiond_browser",
    config = ":native_config",
    tests = ":actiond_failure_specs",
    baseline_dir = "__actiond_timeout__",
    env = {"ACTIOND_HANG": "1"},
    execution_timeout_seconds = 8,
)
visual_test(
    name = "actiond_cancel_test",
    browser = ":actiond_browser",
    config = ":native_config",
    tests = ":actiond_failure_specs",
    baseline_dir = "__actiond_cancel__",
    env = {"ACTIOND_HANG": "1"},
    execution_timeout_seconds = 90,
)
`)

// ARM64 exercises the VRT lane; ordinary isolated tests retain their x64 tools.
if (process.env.ACTIOND_ARCH === 'arm64') {
  const isolation = path.join(destination, 'actiond-isolation.visual.spec.ts')
  fs.writeFileSync(isolation, fs.readFileSync(isolation, 'utf8').replace("expect(process.arch).toBe('x64')", "expect(process.arch).toBe('arm64')"))
  fs.writeFileSync(build, fs.readFileSync(build, 'utf8')
    .replace(/((?:component_)?visual_test\(\n)/g, '$1    target_arch = "arm64",\n')
    .replace(/(browser_runtime\(\n)/g, '$1    arch = "arm64",\n    loader = "lib/ld-linux-aarch64.so.1",\n'))
}
