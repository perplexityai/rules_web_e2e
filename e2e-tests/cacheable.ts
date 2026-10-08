import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {consumerTest, run, text} from './harness.ts'

consumerTest((work, consumer, command) => {
  const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH
  assert(browsers && path.isAbsolute(browsers), 'Provision PLAYWRIGHT_BROWSERS_PATH before this test')
  const browserFiles = path.join(consumer, 'cache-browsers')
  fs.cpSync(browsers, browserFiles, {recursive: true, mode: fs.constants.COPYFILE_FICLONE})
  fs.writeFileSync(path.join(browserFiles, 'cache-input.txt'), 'browser revision 1')
  fs.writeFileSync(path.join(consumer, 'cache-app.html'), '<div id="result"></div><script>fetch("/api").then(r => r.json()).then(x => document.querySelector("#result").textContent = x.message)</script>')
  fs.writeFileSync(path.join(consumer, 'cache-mock.json'), '{"message":"first"}')
  fs.writeFileSync(path.join(consumer, 'cache-debug.map'), '{"version":3,"sources":[],"mappings":""}')
  fs.writeFileSync(path.join(consumer, 'cache-assets.map'), '{"version":3,"sources":[],"mappings":""}')
  const buildFile = path.join(consumer, 'BUILD.bazel')
  fs.writeFileSync(buildFile, 'load("@bazel_lib//lib:copy_to_directory.bzl", "copy_to_directory")\n' + text(buildFile))
  fs.appendFileSync(path.join(consumer, 'BUILD.bazel'), `
copy_to_directory(name = "cache_assets", srcs = ["cache-app.html", "cache-assets.map"])
js_library(name = "cache_config", srcs = ["cache.config.js"], deps = [":typecheck_project"], data = ["package.json"])
filegroup(name = "cache_browsers", srcs = glob(["cache-browsers/**"]))
genrule(name = "cache_component_spec", srcs = ["cache.spec.js"], outs = ["cache.browser.spec.js"], cmd = "cp $(SRCS) $(OUTS)")
js_library(name = "cache_specs", srcs = ["cache.spec.js"], deps = [":typecheck_project"], data = ["cache-debug.map", ":cache_assets"])
js_library(name = "cache_component_specs", srcs = [":cache_component_spec"], deps = [":typecheck_project"], data = ["cache-debug.map", ":cache_assets"])
`)
  for (const [name, macro, specs, policy] of [
    ['cached_e2e', 'web_e2e_test', 'cache_specs', 'True'],
    ['cached_component', 'component_browser_test', 'cache_component_specs', 'True'],
    ['uncached_e2e', 'web_e2e_test', 'cache_specs', undefined],
  ]) {
    fs.appendFileSync(path.join(consumer, 'BUILD.bazel'), `
${macro}(
    name = "${name}", tests = ":${specs}", config = ":cache_config",
    playwright = ":playwright",
    data = [":cache_browsers", "cache-mock.json"],
    env = {
        "PLAYWRIGHT_BROWSERS_PATH": ${JSON.stringify(browserFiles)},
        "CACHE_INPUTS": json.encode({"app": "cache_assets/cache-app.html", "mock": "$(rootpath cache-mock.json)"}),
    },
    ${policy ? `cacheable = ${policy},` : ''}
)
`)
  }
  const check = (cached: boolean, fresh = false) => {
    const events = path.join(work, 'events.json')
    run([...command, 'test', '//:cached_e2e', '//:cached_component', '//:uncached_e2e',
      `--build_event_json_file=${events}`, '--test_output=errors',
      fresh ? '--cache_test_results=no' : '--cache_test_results=yes'], {cwd: consumer})
    const results = text(events).trim().split('\n').map(line => JSON.parse(line))
      .filter(event => event.testResult)
    for (const name of ['cached_e2e', 'cached_component', 'uncached_e2e']) {
      const result = results.find(event => event.id.testResult.label === `//:${name}`)
      assert(result, `Missing test result: ${name}`)
      assert.equal(result.testResult.status, 'PASSED')
      assert.equal(Boolean(result.testResult.cachedLocally), name === 'uncached_e2e' ? false : cached, name)
    }
  }
  const build = path.join(consumer, 'BUILD.bazel')
  const original = text(build)
  for (const [macro, options, explicitBrowser] of [
    ['web_e2e_test', 'browser = ":actiond_browser",', true],
    ['web_e2e_test', 'base_url = "https://live.invalid",', true],
    ['web_e2e_test', 'base_url_env = "LIVE_URL",', true],
    ['web_e2e_test', 'env_inherit = ["TOKEN"],', true],
    ['web_e2e_test', '', false],
    ['visual_test', '', true],
    ['browser_process_test', '', true],
  ] as const) {
    try {
      fs.writeFileSync(build, `load("@rules_web_e2e//e2e:defs.bzl", "browser_process_test")\n` + original + `
${macro}(name = "rejected", tests = ":cache_specs", config = ":cache_config", cacheable = True,
    ${options}
    ${explicitBrowser ? 'env = {"PLAYWRIGHT_BROWSERS_PATH": "/explicit-browser"},' : ''}
)
`)
      const output = run([...command, 'query', '//:rejected'], {cwd: consumer, fail: true, stdio: 'pipe'})
      assert.match(output, /cacheable requires/, `${macro}: ${options}`)
    } finally {
      fs.writeFileSync(build, original)
    }
  }
  check(false)
  check(true)
  fs.appendFileSync(path.join(consumer, 'cache.spec.ts'), '\nexport type CacheMetadata = {label?: string}\n')
  check(true)
  fs.writeFileSync(path.join(consumer, 'cache-debug.map'), '{"version":3,"sources":["cache.spec.ts"],"mappings":""}')
  check(true)
  fs.writeFileSync(path.join(consumer, 'cache-assets.map'), '{"version":3,"sources":["cache-app.html"],"mappings":""}')
  check(true)
  fs.appendFileSync(path.join(consumer, 'cache.spec.ts'), '\nexport const runtimeRevision: number = 1\n')
  check(false)
  check(true)
  fs.appendFileSync(path.join(consumer, 'cache-app.html'), '<!-- app changed -->')
  check(false)
  check(true)
  fs.writeFileSync(path.join(consumer, 'cache-mock.json'), '{"message":"second"}')
  check(false)
  check(true)
  fs.appendFileSync(path.join(browserFiles, 'cache-input.txt'), '\nbrowser revision 2')
  check(false)
  check(true)
  check(false, true)
})
