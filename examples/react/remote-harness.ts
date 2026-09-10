import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {spawn} from 'node:child_process'
import path from 'node:path'

let blockedRequests = 0
const blocked = createServer((_request, response) => {
  blockedRequests++
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.end('reachable')
})
blocked.listen(0, '127.0.0.1')
await once(blocked, 'listening')
const blockedAddress = blocked.address()
assert(blockedAddress && typeof blockedAddress !== 'string')
const blockedUrl = `http://127.0.0.1:${blockedAddress.port}/`
assert.equal(await (await fetch(blockedUrl)).text(), 'reachable')
blockedRequests = 0

// This server belongs to the caller, outside the runner's lifecycle.
const server = createServer((request, response) => {
  if (request.url !== '/fixture/') {
    response.writeHead(404).end()
    return
  }
  response.setHeader('Content-Type', 'text/html')
  response.end(
    '<h1>External fixture</h1><button onclick="this.textContent=\'Saved\'">Save</button>'
  )
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const address = server.address()
assert(address && typeof address !== 'string')
const url = `http://127.0.0.1:${address.port}/fixture/`
try {
  const child = spawn(
    path.join(
      process.env.RUNFILES_DIR || process.env.JS_BINARY__RUNFILES!,
      process.env.REMOTE_TEST!
    ),
    [],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        EXAMPLE_REMOTE_URL: url,
        EXAMPLE_BLOCKED_URL: blockedUrl,
      },
    }
  )
  const [code] = await once(child, 'exit')
  assert.equal(code, 0, 'remote Playwright target failed')
  assert.equal(blockedRequests, 0, 'browser must not reach undeclared origins')
  assert.equal(
    (await fetch(url)).status,
    200,
    'runner must not stop the external server'
  )
} finally {
  blocked.closeAllConnections()
  blocked.close()
  server.closeAllConnections()
  server.close()
}
