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
    const scratch = path.join(directory, 'session')
    fs.mkdirSync(scratch)
    const output = path.join(scratch, 'aggregate.mjs')
    fs.writeFileSync(output, aggregateConfig(original, tests, scratch))
    const config = (await import(pathToFileURL(output).href)).default
    assert.equal(config.testDir, directory)
    assert.equal(config.use.baseURL, 'http://localhost:1234')
    assert.equal(config.webServer[0].cwd, directory)
    for (const file of tests) {
      const staged = path.join(config.projects[0].testDir, path.relative(directory, file) + '.mjs')
      assert.ok(config.testMatch.some((pattern: RegExp) => pattern.test(staged)))
      assert.ok(!config.testMatch.some((pattern: RegExp) => pattern.test(file)))
    }
    assert.ok(!config.testMatch.some((pattern: RegExp) => pattern.test(path.join(directory, 'other.spec.js'))))
    assert.equal(config.projects[0].name, 'chromium')
    assert.equal(config.projects[0].testDir, path.join(scratch, 'specs'))
    assert.deepEqual(config.projects[0].testMatch, config.testMatch)
  } finally {
    fs.rmSync(directory, {recursive: true, force: true})
  }
})

test('empty aggregation fails before Playwright can discover unrelated specs', () => {
  assert.throws(() => aggregateConfig('/config.js', [], '/unused'), /at least one spec/)
})

test('staged specs execute original modules with relative imports outside the watched tree', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-import-test-'))
  try {
    const compiled = path.join(directory, 'compiled')
    const session = path.join(directory, 'session')
    fs.mkdirSync(compiled)
    fs.mkdirSync(session)
    const marker = path.join(directory, 'executed.txt')
    fs.writeFileSync(path.join(compiled, 'helper.mjs'), 'export default "original helper"')
    const spec = path.join(compiled, 'selected.spec.mjs')
    fs.writeFileSync(spec, `import fs from 'node:fs'; import value from './helper.mjs'; fs.writeFileSync(${JSON.stringify(marker)}, value)`)
    fs.mkdirSync(path.join(compiled, 'tool.runfiles'))
    fs.writeFileSync(path.join(compiled, 'tool.runfiles', 'unselected.spec.mjs'), 'throw new Error("unselected")')
    aggregateConfig(path.join(compiled, 'config.mjs'), [spec], session)
    const staged = path.join(session, 'specs', 'selected.spec.mjs.mjs')
    await import(pathToFileURL(staged).href)
    assert.equal(fs.readFileSync(marker, 'utf8'), 'original helper')
    assert.deepEqual(fs.readdirSync(path.join(session, 'specs')), ['selected.spec.mjs.mjs'])
  } finally {
    fs.rmSync(directory, {recursive: true, force: true})
  }
})
