import assert from 'node:assert/strict'
import {test} from 'node:test'
import {componentBrowserConfig} from './config.js'

test('component gallery resolves base paths without broadening browser access', () => {
  const previous = {...process.env}
  Object.assign(process.env, {
    VRT_APP_URL: 'https://preview.example/app/',
    VRT_OUTPUTS: '/tmp/results',
    VRT_WS_ENDPOINT: 'ws://127.0.0.1:1234',
    VRT_NETWORK_ORIGINS: '["https://auth.example"]',
  })
  try {
    const config = componentBrowserConfig({
      root: '/specs',
      gallery: './gallery.html?theme=dark',
    })
    assert.equal(
      config.use?.baseURL,
      'https://preview.example/app/gallery.html?theme=dark'
    )
    assert.equal(
      config.use?.connectOptions?.exposeNetwork,
      'preview.example:443,auth.example:443'
    )
    for (const gallery of [
      '',
      '//other.example/gallery',
      'https://other.example',
      'https://user:secret@preview.example/gallery',
      '/gallery#fragment',
    ])
      assert.throws(() => componentBrowserConfig({root: '/specs', gallery}))
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key]
    Object.assign(process.env, previous)
  }
})
