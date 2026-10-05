import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {test} from 'node:test'
import {runfiles} from '@bazel/runfiles'

test('launcher tools match target architecture and need no external loader or shared libraries', () => {
  const machine = Number(process.argv[2])
  const binaries = process.argv.slice(3).flatMap(arg => arg.split(' ')).filter(p => ['toybox', 'file', 'zip'].includes(path.basename(p)))
  assert.equal(binaries.length, 3)
  for (const name of binaries) {
    const data = fs.readFileSync(runfiles.resolve(name))
    assert.deepEqual(data.subarray(0, 6), Buffer.from([127, 69, 76, 70, 2, 1]), name)
    assert.equal(data.readUInt16LE(18), machine, name)
    const offset = Number(data.readBigUInt64LE(32)), size = data.readUInt16LE(54), count = data.readUInt16LE(56)
    for (let i = 0; i < count; i++) {
      const position = offset + i * size, kind = data.readUInt32LE(position)
      assert.notEqual(kind, 3, `${name}: ELF interpreter requires an external loader`)
      if (kind === 2) {
        const start = Number(data.readBigUInt64LE(position + 8)), length = Number(data.readBigUInt64LE(position + 32))
        for (let j = start; j < start + length; j += 16)
          assert.notEqual(data.readBigInt64LE(j), 1n, `${name}: DT_NEEDED requires shared libraries`)
      }
    }
  }
})
