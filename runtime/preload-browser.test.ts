import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn, type ChildProcess} from 'node:child_process'
import {once} from 'node:events'
import {fileURLToPath} from 'node:url'
import {dockerProxy, alternateReaper} from './fixtures/docker-proxy.js'
import {testEnvironment} from './isolation.js'

const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const browserImage = manifest.images.find((item: any) => item.roles.includes('browser')).image as string
const reaperImage = manifest.images.find((item: any) => item.roles.includes('reaper')).image as string
const proxy = await dockerProxy()
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'preload-browser-'))
fs.writeFileSync(path.join(temp, 'config.json'), '{}')
const workers: ChildProcess[] = []
const run = async (expected?: RegExp, directImage?: string) => {
  const child = spawn(fs.realpathSync(process.env.JS_BINARY__NODE_BINARY || process.execPath),
    [fileURLToPath(new URL('./fixtures/preload-worker.js', import.meta.url))], {
      env: {...testEnvironment({}, [], temp), PATH: '/usr/bin:/bin',
        DOCKER_CONFIG: temp, DOCKER_HOST: proxy.host,
        BROWSER_IMAGE: browserImage, RYUK_CONTAINER_IMAGE: reaperImage, DIRECT_IMAGE: directImage},
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
  workers.push(child)
  const [message] = await Promise.race([
    once(child, 'message'),
    once(child, 'exit').then(([code]) => { throw new Error(`Worker exited before result: ${code}`) }),
  ])
  if (expected) {
    assert.match(message.error, expected)
    const [code] = await once(child, 'exit')
    assert.equal(code, 1)
  } else assert.equal(message.ready, true, message.error)
  return child
}
const absent = async (route: string) => assert.rejects(proxy.api(route), /Docker 404/)
let alternate: string | undefined
let alternateImage: string | undefined
try {
  // Every declared image is required before any resource is created.
  for (const image of [browserImage, reaperImage]) {
    proxy.missingImages.add(image)
    await run(/Preload required image/)
    // Exercise the patched pull path too, independently of runner preflight.
    await run(/TESTCONTAINERS_PULL_POLICY=never/, image)
    assert.equal(proxy.containers.length, 0)
    assert.equal(proxy.networks.length, 0)
    proxy.missingImages.clear()
  }
  await run()
  const original = proxy.containers.find(item => item.image === reaperImage)!.id
  proxy.reapers.add(original)
  await run()
  assert.equal(proxy.containers.filter(item => item.image === reaperImage).length, 1, 'must reuse the real matching reaper')
  for (const {id, image} of proxy.containers)
    if (image === browserImage) await absent(`/containers/${id}/json`)
  for (const id of proxy.networks) await absent(`/networks/${id}`)

  const created = proxy.containers.length
  proxy.unverifiableContainers.add(original)
  await run(/Cannot verify existing Ryuk/)
  proxy.unverifiableContainers.clear()
  assert.equal(proxy.containers.length, created)
  assert.equal((await proxy.api(`/containers/${original}/json`)).State.Running, true)

  // Commit a different image of the actual Ryuk executable, not a label-only fake.
  const modified = await alternateReaper(proxy, original)
  alternate = modified.id
  alternateImage = modified.image
  proxy.reapers.clear()
  proxy.reapers.add(alternate!)
  await run(/Existing Ryuk .* does not match/)
  assert.equal(proxy.containers.length, created)
  assert.equal((await proxy.api(`/containers/${alternate}/json`)).State.Running, true)
  assert.equal((await proxy.api(`/containers/${original}/json`)).State.Running, true)
  assert.equal(proxy.forbidden, 0, 'no pull/auth attempt, including all failure cases')
} finally {
  for (const child of workers) if (child.connected) child.send('stop')
  await Promise.all(workers.map(child => child.exitCode === null ? once(child, 'exit') : undefined))
  // Only this test's resources; never remove an unrelated daemon's reaper.
  for (const id of [...proxy.containers.map(item => item.id), ...(alternate ? [alternate] : [])])
    await proxy.api(`/containers/${id}?force=true&v=true`, 'DELETE').catch(() => {})
  for (const id of proxy.networks) await proxy.api(`/networks/${id}`, 'DELETE').catch(() => {})
  if (alternateImage) await proxy.api(`/images/${alternateImage}`, 'DELETE').catch(() => {})
  proxy.close()
  fs.rmSync(temp, {recursive: true, force: true})
}
