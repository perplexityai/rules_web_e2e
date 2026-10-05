import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {consumerTest, files, run, text} from './harness.ts'

consumerTest((_work, consumer, command) => {
    run([...command, 'test', '//:host_snapshot_export_test', '--test_arg=--export-snapshots',
      '--test_arg=--grep=exports', '--nocache_test_results'], {cwd: consumer})
    const snapshots = files(path.join(consumer, 'bazel-testlogs/host_snapshot_export_test/test.outputs/snapshots'))
    assert.equal(snapshots.length, 1)
    assert.equal(path.basename(snapshots[0]), `page-${process.platform}.png`)
    assert.equal(fs.readFileSync(snapshots[0]).subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    const sources = JSON.parse(text(path.join(consumer, 'bazel-testlogs/host_snapshot_export_test/test.outputs/snapshot-sources.json')))
    assert.equal(sources['snapshot-export.spec.js'], '_main/snapshot-export.spec.js')
    assert(!fs.existsSync(path.join(consumer, 'snapshot-export.spec.ts-snapshots')))
    const missing = run([...command, 'test', '//:host_snapshot_export_test', '--nocache_test_results',
      '--test_output=errors'], {cwd: consumer, fail: true, stdio: 'pipe'})
    assert.match(missing, /snapshot doesn't exist|snapshot.*missing/i)
    run([...command, 'build', '//:host_snapshot_export_test_snapshot_capture',
      `--action_env=PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH}`], {cwd: consumer})
    assert(files(path.join(consumer, 'bazel-bin/host_snapshot_export_test_snapshot_capture.results/snapshots')).length > 0)
    assert(!fs.existsSync(path.join(consumer, 'snapshots')), 'Capture action modified source')
    run([...command, 'run', `--action_env=PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH}`,  '//:host_snapshot_export_test.update'], {cwd: consumer})
    run([...command, 'test', '//:host_snapshot_export_test', '--nocache_test_results'], {cwd: consumer})
    const baseline = path.join(consumer, 'snapshots/default/snapshot-export.spec.js-snapshots')
    const second = fs.readFileSync(path.join(baseline, `second-${process.platform}.png`))
    run([...command, 'run', `--action_env=PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH}`,  '//:host_snapshot_export_test.update', '--@rules_web_e2e//:snapshot_filter=exports'], {cwd: consumer})
    assert.deepEqual(fs.readFileSync(path.join(baseline, `second-${process.platform}.png`)), second)
    const before = files(path.join(consumer, 'snapshots')).map(file => [file, fs.readFileSync(file).toString('hex')])
    run([...command, 'run', `--action_env=PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH}`,  '//:host_snapshot_export_test.update', '--@rules_web_e2e//:snapshot_filter=no-matching-test'], {cwd: consumer, fail: true, stdio: 'pipe'})
    const build = path.join(consumer, 'BUILD.bazel')
    fs.writeFileSync(build, text(build).replace('name = "host_snapshot_export_test",', 'name = "host_snapshot_export_test", args = ["--pass-with-no-tests"],'))
    const empty = run([...command, 'run', `--action_env=PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH}`, '//:host_snapshot_export_test.update', '--@rules_web_e2e//:snapshot_filter=no-matching-test'], {cwd: consumer, fail: true, stdio: 'pipe'})
    assert.match(empty, /no snapshots/i)
    fs.writeFileSync(build, text(build).replace(' args = ["--pass-with-no-tests"],', ''))
    fs.writeFileSync(build, text(build).replace('name = "host_snapshot_export_test",', 'name = "host_snapshot_export_test", env = {"SNAPSHOT_FAIL": "1"},'))
    run([...command, 'run', `--action_env=PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH}`,  '//:host_snapshot_export_test.update'], {cwd: consumer, fail: true, stdio: 'pipe'})
    assert.deepEqual(files(path.join(consumer, 'snapshots')).map(file => [file, fs.readFileSync(file).toString('hex')]), before)

    fs.writeFileSync(build, text(build).replace(' env = {"SNAPSHOT_FAIL": "1"},', ''))
    fs.appendFileSync(path.join(consumer, 'native.config.ts'), `
config.snapshotPathTemplate = '/unused/{projectName}/{arg}{ext}'
config.expect = {toHaveScreenshot: {pathTemplate: path.join(import.meta.dirname, 'forbidden/{arg}{ext}')}}
config.projects = [{name: 'desktop', use: {viewport: {width: 800, height: 600}}}, {name: 'mobile', use: {viewport: {width: 400, height: 600}}}]
`)
    run([...command, 'run', `--action_env=PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH}`,  '//:host_snapshot_export_test.update'], {cwd: consumer})
    assert(!fs.existsSync(path.join(consumer, 'bazel-bin/forbidden')))
    const desktop = fs.readFileSync(path.join(consumer, `snapshots/project-desktop/snapshot-export.spec.js-snapshots/page-${process.platform}.png`))
    const mobile = fs.readFileSync(path.join(consumer, `snapshots/project-mobile/snapshot-export.spec.js-snapshots/page-${process.platform}.png`))
    assert.notDeepEqual(desktop, mobile)
    run([...command, 'test', '//:host_snapshot_export_test', '--nocache_test_results'], {cwd: consumer})
    fs.writeFileSync(build, 'load("@rules_web_e2e//e2e:defs.bzl", "browser_process_test")\n' + text(build) + `
genrule(name = "snapshot_component_spec", srcs = ["snapshot-export.spec.js"], outs = ["snapshot-export.browser.spec.js"], cmd = "cp $(SRCS) $(OUTS)")
js_library(name = "snapshot_component_specs", srcs = [":snapshot_component_spec"], deps = [":typecheck_project"])
component_browser_test(name = "snapshot_component_test", playwright = ":playwright", tests = ":snapshot_component_specs", config = ":native_config", snapshot_dir = "component-snapshots", snapshots = glob(["component-snapshots/**"], allow_empty = True))
browser_process_test(name = "snapshot_process_test", playwright = ":playwright", tests = ":snapshot_export_specs", config = ":native_config", snapshot_dir = "process-snapshots", snapshots = glob(["process-snapshots/**"], allow_empty = True), env = {"PLAYWRIGHT_BROWSERS_PATH": ${JSON.stringify(process.env.PLAYWRIGHT_BROWSERS_PATH)}})
`)
    for (const target of ['snapshot_component_test', 'snapshot_process_test']) {
      run([...command, 'run', `--action_env=PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH}`,  `//:${target}.update`], {cwd: consumer})
      run([...command, 'test', `//:${target}`, '--nocache_test_results'], {cwd: consumer})
    }

})
