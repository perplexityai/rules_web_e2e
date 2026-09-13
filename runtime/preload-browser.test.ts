// An API proxy forbids pulls/auth and hides existing reapers: cached containers
// cannot mask a missing helper image in this real-daemon regression.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {once} from 'node:events'
import {createRequire} from 'node:module'
import {chromium} from 'playwright'
import {startBrowser} from './container.js'

const require = createRequire(import.meta.url)
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as {
  images: {image: string; platform: string | null; roles: string[]}[]
}
const browserImage = manifest.images.find(image => image.roles.includes('browser'))!
const reaperImage = manifest.images.find(image => image.roles.includes('reaper'))!
const daemon = process.env.DOCKER_HOST
const daemonUrl = daemon && !daemon.startsWith('unix:')
  ? new URL(daemon.replace(/^tcp:/, 'http:')) : undefined
if (daemonUrl) assert.equal(daemonUrl.protocol, 'http:', 'test proxy supports TCP or Unix daemons')
const upstream = daemonUrl
  ? {hostname: daemonUrl.hostname, port: daemonUrl.port}
  : {socketPath: daemon?.replace(/^unix:\/\//, '') || '/var/run/docker.sock'}
let forbidden = 0
const createdImages: string[] = []
const proxy = http.createServer((request, response) => {
  const route = request.url!
  if (/\/(images\/create|auth)(\?|$)/.test(route)) {
    forbidden++
    response.writeHead(403).end('Registry access forbidden by preload regression')
    return
  }
  const forward = http.request({...upstream, path: route, method: request.method, headers: request.headers}, result => {
    response.on('close', () => { result.destroy(); forward.destroy() })
    if (/\/containers\/json(\?|$)/.test(route)) {
      const chunks: Buffer[] = []
      result.on('data', chunk => chunks.push(chunk))
      result.on('end', () => {
        const containers = JSON.parse(Buffer.concat(chunks).toString()) as {Labels: Record<string, string>}[]
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(containers.filter(container =>
          container.Labels?.['org.testcontainers.ryuk'] !== 'true')))
      })
    } else {
      response.writeHead(result.statusCode!, result.headers)
      result.pipe(response)
    }
  })
  forward.on('error', error => response.destroy(error))
  if (/\/containers\/create(\?|$)/.test(route)) {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks)
      createdImages.push(JSON.parse(body.toString()).Image)
      forward.end(body)
    })
  } else request.pipe(forward)
})
proxy.on('upgrade', (request, socket, head) => {
  const forward = http.request({...upstream, path: request.url, method: request.method, headers: request.headers})
  forward.on('upgrade', (response, remote, remoteHead) => {
    socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n` +
      Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n') + '\r\n\r\n')
    if (head.length) remote.write(head)
    if (remoteHead.length) socket.write(remoteHead)
    socket.pipe(remote).pipe(socket)
    socket.on('error', () => remote.destroy())
    remote.on('error', () => socket.destroy())
  })
  forward.on('error', () => socket.destroy())
  forward.end()
})
proxy.listen(0, '127.0.0.1')
await once(proxy, 'listening')
const address = proxy.address()
assert(address && typeof address !== 'string')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'preload-browser-'))
// No registry credentials or credential helpers in the test process.
process.env.DOCKER_CONFIG = temp
fs.writeFileSync(path.join(temp, 'config.json'), '{}')
process.env.DOCKER_HOST = `tcp://127.0.0.1:${address.port}`
for (const key of Object.keys(process.env))
  if (key.startsWith('TESTCONTAINERS_') || key.startsWith('RYUK_')) delete process.env[key]
process.env.RYUK_CONTAINER_IMAGE = reaperImage.image
let stop: (() => Promise<void>) | undefined
try {
  const container = await startBrowser(browserImage.image,
    path.dirname(createRequire(require.resolve('playwright/package.json')).resolve('playwright-core/package.json')),
    browserImage.platform!)
  stop = container.stop
  const browser = await chromium.connect(container.endpoint)
  try {
    const page = await browser.newPage()
    await page.setContent('<h1>Preloaded browser</h1>')
    assert.equal(await page.locator('h1').textContent(), 'Preloaded browser')
  } finally {
    await browser.close()
  }
  assert.equal(forbidden, 0, 'no image pull or registry auth may be attempted')
  assert.deepEqual(createdImages.sort(), [reaperImage.image, browserImage.image, browserImage.image].sort())
} finally {
  await stop?.()
  proxy.closeAllConnections()
  proxy.close()
  fs.rmSync(temp, {recursive: true, force: true})
}
