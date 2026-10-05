import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {validate} from './validate_packages.js'

test('only matching, readable package metadata produces a validation output', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'packages-'))
  t.after(() => fs.rmSync(root, {recursive: true, force: true}))
  for (const dir of ['test', 'core']) fs.mkdirSync(path.join(root, dir))
  const output = path.join(root, 'validated.json')
  for (const [a, b] of [['1.63.0', '1.63.0'], ['1.64.0', '1.63.0'], ['1.63.0', '1.64.0'], ['1.64.0', '1.64.0']]) {
    fs.writeFileSync(path.join(root, 'test/package.json'), JSON.stringify({version: a}))
    fs.writeFileSync(path.join(root, 'core/package.json'), JSON.stringify({version: b}))
    if (a === b && a === '1.63.0') {
      validate(path.join(root, 'test'), path.join(root, 'core'), '1.63.0', output)
      assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), {version: '1.63.0'})
      fs.unlinkSync(output)
    } else {
      assert.throws(() => validate(path.join(root, 'test'), path.join(root, 'core'), '1.63.0', output), /mismatch/)
      assert(!fs.existsSync(output))
    }
  }
  for (const content of ['{}', 'invalid', null]) {
    const metadata = path.join(root, 'test/package.json')
    if (content === null) fs.unlinkSync(metadata); else fs.writeFileSync(metadata, content)
    assert.throws(() => validate(path.join(root, 'test'), path.join(root, 'core'), '1.63.0', output))
    assert(!fs.existsSync(output))
  }
})
