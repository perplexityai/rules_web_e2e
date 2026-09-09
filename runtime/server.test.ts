import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {test} from 'node:test'

for (const invalid of [false, true]) {
  test(
    invalid
      ? 'rejects remote server URLs and closes the adapter'
      : 'serves a custom fixture and calls adapter cleanup on termination',
    async t => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-server-'))
      const child = spawn(
        process.env.JS_BINARY__NODE_BINARY || process.execPath,
        [fileURLToPath(new URL('./server.js', import.meta.url))],
        {
          cwd: root,
          stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
          env: {
            VRT_CUSTOM_SERVER: fileURLToPath(
              new URL('./fixtures/custom-server.js', import.meta.url)
            ),
            VRT_INPUTS: root,
            VRT_CACHE: root,
            ...(invalid ? {INVALID_SERVER_URL: 'https://example.com/'} : {}),
          },
        }
      )
      t.after(() => {
        child.kill('SIGKILL')
        fs.rmSync(root, {recursive: true, force: true})
      })
      const exited = once(child, 'exit')
      let errors = ''
      child.stderr!.on('data', chunk => {
        errors += chunk
      })
      if (!invalid) {
        const [{url}] = (await once(child, 'message')) as [{url: string}]
        assert.equal(new URL(url).pathname, '/fixture/')
        assert.equal(await (await fetch(url)).text(), 'custom fixture')
        child.kill('SIGTERM')
      }
      const [code] = await exited
      assert.equal(code, invalid ? 1 : 0, errors)
      if (invalid) assert.match(errors, /127\.0\.0\.1 with an explicit port/)
      assert.equal(fs.readFileSync(path.join(root, 'closed'), 'utf8'), 'yes')
    }
  )
}
