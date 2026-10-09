import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'

const configFile = fs.realpathSync(path.join(process.env.UI_BUNDLE, 'playwright.config.mjs'))
const bundle = path.dirname(configFile)
const {default: config} = await import(pathToFileURL(configFile).href)
const {playwrightCli} = await import(pathToFileURL(path.join(bundle, 'runfiles.mjs')).href)
const snapshot = () => fs.readdirSync(bundle, {recursive: true}).sort().filter(file => fs.statSync(path.join(bundle, file)).isFile())
  .map(file => [file, fs.readFileSync(path.join(bundle, file), 'utf8')])
const before = snapshot()
assert.equal(config.projects[0].name, 'overridden')
assert.equal(config.projects[0].testDir, path.join(bundle, 'specs'))
assert.equal(path.relative(bundle, config.outputDir).split(path.sep)[0], '..')

const result = spawnSync(process.execPath, [playwrightCli, 'test', '--config', configFile, '--reporter=json'], {
  encoding: 'utf8',
  env: {...process.env, UI_FIXTURE_PACKAGE: undefined},
})
assert.equal(result.status, 0, result.stderr + result.stdout)
const report = JSON.parse(result.stdout)
assert.equal(report.stats.expected, 2)
assert.equal(report.stats.unexpected, 0)
assert.deepEqual(snapshot(), before)

const selected = spawnSync(process.execPath, [playwrightCli, 'test', '--config', configFile, 'auth\\.spec\\.ts', '--reporter=json'], {
  encoding: 'utf8',
  env: {...process.env, UI_FIXTURE_PACKAGE: undefined},
})
assert.equal(selected.status, 0, selected.stderr + selected.stdout)
assert.equal(JSON.parse(selected.stdout).stats.expected, 1)
