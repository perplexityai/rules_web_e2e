import assert from 'node:assert/strict'
import fs from 'node:fs'
import {test} from 'node:test'
import {containerHostOverride} from './container-host.js'

test('runtime manifest follows browser overrides and deduplicates the relay', () => {
  const [standard, overridden] = process.argv.slice(2).map(file =>
    JSON.parse(fs.readFileSync(file, 'utf8')) as {
      schemaVersion: number
      images: {image: string; platform: string | null; roles: string[]}[]
    })
  assert.equal(standard.schemaVersion, 1)
  const browser = overridden.images.find(image => image.roles.includes('browser'))!
  assert.equal(browser.image,
    'registry.example/browser@sha256:' + 'a'.repeat(64))
  assert.equal(browser.platform, 'linux/amd64')
  assert.deepEqual(browser.roles, ['browser', 'control-relay'])
  assert.notEqual(browser.image, standard.images[0].image)
  assert.deepEqual(overridden.images[1], standard.images[1])
  assert.deepEqual(standard.images[1].roles, ['reaper'])
  assert.equal(standard.images[1].platform, null)
  for (const manifest of [standard, overridden]) {
    assert.equal(manifest.images.length, 2)
    assert.equal(new Set(manifest.images.map(image => JSON.stringify([image.image, image.platform]))).size, 2)
    for (const image of manifest.images) assert.match(image.image, /@sha256:[a-f0-9]{64}$/)
  }
})

test('containerized daemon discovery cannot invoke an unlisted gateway helper', () => {
  assert.equal(containerHostOverride(false, undefined, false), undefined)
  assert.equal(containerHostOverride(true, 'tcp://docker.example:2376', false), 'docker.example')
  assert.equal(containerHostOverride(true, 'https://[::1]:2376', false), '::1')
  for (const host of [undefined, 'unix:///var/run/docker.sock', 'ssh://docker.example'])
    assert.throws(() => containerHostOverride(true, host, false), /explicit TCP\/HTTP/)
  assert.throws(() => containerHostOverride(true, 'tcp://docker.example:2376', true), /properties/)
})
