import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {pathToFileURL} from 'node:url'
import {aggregateConfig} from './ui.js'

test('aggregate selection includes only selected specs and overrides project discovery', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-config-test-'))
  try {
    const original = path.join(directory, 'original.mjs')
    fs.writeFileSync(original, 'export default {use: {baseURL: "http://localhost:1234"}, webServer: {command: "node server.js"}, projects: [{name: "chromium", testDir: "/wrong", testMatch: "wrong"}]}')
    const tests = [path.join(directory, 'auth/a.spec.js'), path.join(directory, 'billing/b[1].spec.js')]
    const output = path.join(directory, 'aggregate.mjs')
    fs.writeFileSync(output, aggregateConfig(original, tests))
    const config = (await import(pathToFileURL(output).href)).default
    assert.equal(config.testDir, directory)
    assert.equal(config.use.baseURL, 'http://localhost:1234')
    assert.equal(config.webServer[0].cwd, directory)
    for (const file of tests) assert.ok(config.testMatch.some((pattern: RegExp) => pattern.test(file)))
    assert.ok(!config.testMatch.some((pattern: RegExp) => pattern.test(path.join(directory, 'other.spec.js'))))
    assert.equal(config.projects[0].name, 'chromium')
    assert.equal(config.projects[0].testDir, directory)
    assert.deepEqual(config.projects[0].testMatch, config.testMatch)
  } finally {
    fs.rmSync(directory, {recursive: true, force: true})
  }
})

test('empty aggregation fails before Playwright can discover unrelated specs', () => {
  assert.throws(() => aggregateConfig('/config.js', []), /at least one spec/)
})
