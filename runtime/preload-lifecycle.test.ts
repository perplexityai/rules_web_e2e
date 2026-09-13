// Run public compare/update executables with declared Node and a registry-denying daemon.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {dockerProxy, alternateReaper} from './fixtures/docker-proxy.js'

const runfiles = process.env.RUNFILES_DIR || process.env.JS_BINARY__RUNFILES!
const resolve = (name: string) => path.join(runfiles, process.env[name]!)
const manifest = JSON.parse(fs.readFileSync(resolve('PRELOAD_IMAGES'), 'utf8'))
const browser = manifest.images.find((item: any) => item.roles.includes('browser')).image as string
const reaper = manifest.images.find((item: any) => item.roles.includes('reaper')).image as string
const expected = fs.readFileSync(resolve('PRELOAD_BASELINE'))
const proxy = await dockerProxy()
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'preload-lifecycle-'))
fs.writeFileSync(path.join(temp, 'config.json'), '{}')
// The launchers resolve Node through runfiles, not PATH. Preserve only Bazel plumbing.
const plumbing = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(RUNFILES|TEST_|BAZEL|JS_BINARY__)/.test(key)))
const run = async (update: boolean, failure?: RegExp) => {
  const child = spawn(resolve(update ? 'PRELOAD_UPDATE' : 'PRELOAD_COMPARE'), [], {
    env: {...plumbing, RUNFILES_DIR: runfiles, RUNFILES_MANIFEST_FILE: path.join(runfiles, 'MANIFEST'), PATH: process.env.PATH, HOME: temp, DOCKER_CONFIG: temp,
      DOCKER_HOST: proxy.host, BUILD_WORKSPACE_DIRECTORY: temp},
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  for (const stream of [child.stdout, child.stderr]) stream!.on('data', data => { output += data })
  const [code] = await once(child, 'exit')
  if (!failure) assert.equal(code, 0, output)
  else {
    assert.notEqual(code, 0, output)
    assert.match(output, failure)
  }
  // Browser and relay must be gone after compare, update, and failed startup.
  for (const {id, image} of proxy.containers)
    if (image === browser) await assert.rejects(proxy.api(`/containers/${id}/json`), /Docker 404/)
  for (const id of proxy.networks) await assert.rejects(proxy.api(`/networks/${id}`), /Docker 404/)
}
let alternate: {id: string; image: string} | undefined
try {
  await run(false)
  alternate = await alternateReaper(proxy, proxy.containers.find(item => item.image === reaper)!.id)
  await run(true)
  const updated = path.join(temp, '__native_screenshots__', 'saved.png')
  assert.deepEqual(fs.readFileSync(updated), expected, 'update must reproduce the committed Linux baseline')
  await run(false)
  for (const image of [browser, reaper]) {
    proxy.missingImages.add(image)
    await run(true, /Preload required image/)
    assert.deepEqual(fs.readFileSync(updated), expected, 'failed update must preserve baselines')
    proxy.missingImages.clear()
  }
  proxy.reapers.add(alternate.id)
  await run(true, /Existing Ryuk .* does not match/)
  assert.deepEqual(fs.readFileSync(updated), expected, 'mismatched Ryuk must not modify baselines')
  proxy.unverifiableContainers.add(alternate.id)
  await run(true, /Cannot verify existing Ryuk/)
  assert.deepEqual(fs.readFileSync(updated), expected, 'unverifiable Ryuk must not modify baselines')
  assert.equal((await proxy.api(`/containers/${alternate.id}/json`)).State.Running, true, 'foreign reaper must not be stopped')
  assert.deepEqual(fs.readFileSync(resolve('PRELOAD_BASELINE')), expected, 'source baseline must remain unchanged')
  assert.equal(proxy.forbidden, 0, 'compare, update and failures must not attempt pulls/auth')
} finally {
  for (const {id} of proxy.containers)
    await proxy.api(`/containers/${id}?force=true&v=true`, 'DELETE').catch(() => {})
  for (const id of proxy.networks) await proxy.api(`/networks/${id}`, 'DELETE').catch(() => {})
  if (alternate) {
    await proxy.api(`/containers/${alternate.id}?force=true&v=true`, 'DELETE')
    await proxy.api(`/images/${alternate.image}`, 'DELETE')
  }
  proxy.close()
  fs.rmSync(temp, {recursive: true, force: true})
}
