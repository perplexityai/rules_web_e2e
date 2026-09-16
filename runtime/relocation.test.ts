import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import {relocateExecutable, relocateInputs, runtimeDirectory} from './relocation.js'

function elf(interpreter = '/lib64/ld-linux-x86-64.so.2') {
  const data = Buffer.alloc(256, 0x51)
  data.set([0x7f, 0x45, 0x4c, 0x46, 2, 1])
  data.writeBigUInt64LE(64n, 32)
  data.writeUInt16LE(56, 54)
  data.writeUInt16LE(1, 56)
  data.writeUInt32LE(3, 64)
  data.writeBigUInt64LE(128n, 72)
  data.writeBigUInt64LE(BigInt(interpreter.length + 1), 96)
  data.write(interpreter + '\0', 128)
  return data
}

test('ELF relocation replaces only the interpreter bytes and rejects invalid segments', () => {
  const input = elf()
  const output = relocateExecutable(input)!
  assert.deepEqual(output.subarray(0, 128), input.subarray(0, 128))
  assert.deepEqual(output.subarray(156), input.subarray(156))
  assert.equal(output.subarray(128, 128 + runtimeDirectory.length + 7).toString(), `${runtimeDirectory}/ld.so\0`)
  assert.equal(input.subarray(128, 156).toString(), '/lib64/ld-linux-x86-64.so.2\0')
  assert.throws(() => relocateExecutable(elf('/ld.so')), /too short/)
  const bad = elf(); bad.writeBigUInt64LE(999n, 72)
  assert.throws(() => relocateExecutable(bad), /Invalid ELF interpreter/)
  assert.throws(() => relocateExecutable(input.subarray(0, 100)), /program-header/)
})

test('ARM64 interpreter relocation preserves its shorter segment and machine header', () => {
  const input = elf('/lib/ld-linux-aarch64.so.1')
  input.writeUInt16LE(183, 18)
  const output = relocateExecutable(input)!
  const end = 128 + '/lib/ld-linux-aarch64.so.1'.length + 1
  assert.deepEqual(output.subarray(0, 128), input.subarray(0, 128))
  assert.deepEqual(output.subarray(end), input.subarray(end))
  assert.equal(output.subarray(128, 128 + runtimeDirectory.length + 7).toString(), `${runtimeDirectory}/ld.so\0`)
})

test('staging relocates executable ELF and common shebangs without changing data or following links', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-relocation-'))
  try {
    const binary = path.join(root, 'node'); fs.writeFileSync(binary, elf(), {mode: 0o555})
    const script = path.join(root, 'server'); fs.writeFileSync(script, '#!/usr/bin/env bash\nprintf hello\n', {mode: 0o755})
    const data = path.join(root, 'data'); fs.writeFileSync(data, elf(), {mode: 0o644})
    fs.symlinkSync('data', path.join(root, 'alias'))
    relocateInputs(root)
    assert.deepEqual(fs.readFileSync(binary), relocateExecutable(elf()))
    assert.equal(fs.statSync(binary).mode & 0o777, 0o555)
    assert.equal(fs.readFileSync(script, 'utf8'), `#!${runtimeDirectory}/bash\nprintf hello\n`)
    assert.deepEqual(fs.readFileSync(data), elf())
    assert.ok(fs.lstatSync(path.join(root, 'alias')).isSymbolicLink())
    assert.equal(relocateExecutable(Buffer.from('#!/usr/bin/env python3\nprint(1)\n')), undefined)
  } finally { fs.rmSync(root, {recursive: true, force: true}) }
})

test('VRT subprocess adapter supplies a declared shell while preserving explicit shell selection', {skip: process.platform === 'win32'}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-shell-'))
  try {
    const shell = path.join(root, 'bash')
    fs.writeFileSync(shell, '#!/bin/sh\nprintf "declared:"\nexec /bin/sh "$@"\n', {mode: 0o755})
    const hook = fileURLToPath(new URL('./vrt-processes.cjs', import.meta.url))
    const probe = `const {spawn}=require('node:child_process'); const c=spawn('printf hello',{shell:SHELL});c.stdout.pipe(process.stdout);c.on('exit',code=>process.exit(code));`
    for (const [selection, expected] of [['true', 'declared:hello'], ['"/bin/sh"', 'hello']]) {
      const result = spawnSync(process.execPath, ['--require', hook, '-e', probe.replace('SHELL', selection)], {
        env: {...process.env, VRT_BASH: shell}, encoding: 'utf8',
      })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stdout, expected)
    }
  } finally { fs.rmSync(root, {recursive: true, force: true}) }
})
