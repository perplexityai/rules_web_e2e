import assert from 'node:assert/strict'
import fs from 'node:fs'
import {spawnSync} from 'node:child_process'
import path from 'node:path'

for (const [target, mode, baselines] of [
  ['native_visual_test', 'visual-spec', '__native_screenshots__'],
  ['component_visual_test', 'visual', '__component_screenshots__'],
]) {
  const runfiles = `/tmp/${target}`
  fs.cpSync(`/workspace/${target}`, runfiles, {recursive: true})
  const output = path.join(path.resolve(process.env.OUTPUT_DIR || '/workspace/outputs'), target)
  const captured = `${output}/update/baselines`
  for (const update of [true, false]) {
    const resultDirectory = `${output}/${update ? 'update' : 'compare'}`
    const artifacts = `${resultDirectory}/artifacts`
    fs.mkdirSync(artifacts, {recursive: true})
    const result = spawnSync('/workspace/runtime/bin/node', [
      `${runfiles}/rules_web_e2e+/runtime/runner.js`, ...(update ? ['--update'] : []),
    ], {
      stdio: 'inherit',
      env: {
        ...process.env,
        RUNFILES_DIR: runfiles,
        RUNFILES_MANIFEST_FILE: `${runfiles}/MANIFEST`,
        JS_BINARY__NODE_BINARY: '/workspace/runtime/bin/node',
        VRT_DESCRIPTOR: `_main/${target}_inputs.json`,
        VRT_BASE_URL: '', VRT_BASE_URL_ENV: '', VRT_MODE: mode,
        VRT_BASELINE_RELATIVE: baselines,
        VRT_NETWORK_ORIGINS: '[]', VRT_NETWORK_ORIGINS_ENV: '[]',
        VRT_ENV_NAMES: '[]', VRT_TIMEOUT_MS: '60000',
        VRT_CAPTURE_OUTPUT: captured,
        TEST_UNDECLARED_OUTPUTS_DIR: artifacts,
      },
    })
    fs.writeFileSync(`${resultDirectory}/result.json`, JSON.stringify({
      schemaVersion: 1,
      mode: update ? 'capture' : 'compare',
      exitCode: result.status ?? 1,
    }))
    assert.ifError(result.error)
    assert.equal(result.status, 0, `${target} ${update ? 'capture' : 'compare'} failed`)
    assert.ok(fs.existsSync(`${artifacts}/junit.xml`))
    if (update) {
      const images = fs.readdirSync(captured).filter(name => name.endsWith('.png'))
      assert.ok(images.length > 0, 'capture must return PNGs')
      // Feed downloaded captures back as declared baseline inputs to comparison.
      const baselineInputs = `${runfiles}/_main/${baselines}`
      fs.rmSync(baselineInputs, {recursive: true, force: true})
      fs.mkdirSync(baselineInputs, {recursive: true})
      for (const name of images) fs.copyFileSync(`${captured}/${name}`, `${baselineInputs}/${name}`)
      const manifest = fs.readFileSync(`${runfiles}/MANIFEST`, 'utf8').split('\n')
        .filter(line => !line.startsWith(`_main/${baselines}/`))
      for (const name of images) manifest.push(`_main/${baselines}/${name} ${baselineInputs}/${name}`)
      fs.writeFileSync(`${runfiles}/MANIFEST`, manifest.filter(Boolean).join('\n') + '\n')
    }
  }
}
