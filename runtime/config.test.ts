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

test('compiled suite config preserves runner paths and accepts a pixel-count budget', async () => {
  const {mkdtempSync, writeFileSync, rmSync} = await import('node:fs')
  const {tmpdir} = await import('node:os')
  const {join} = await import('node:path')
  const temp = mkdtempSync(join(tmpdir(), 'suite-config-'))
  const previous = {...process.env}
  writeFileSync(join(temp, 'package.json'), '{"type":"module"}')
  writeFileSync(join(temp, 'matching.js'), 'export default {maxDiffPixels: 7}')
  writeFileSync(
    join(temp, 'custom.js'),
    `export default {
    testDir: '/wrong', outputDir: '/wrong', updateSnapshots: 'all',
    use: {connectOptions: {wsEndpoint: 'ws://wrong'}, viewport: {width: 500, height: 300}}
  }`
  )
  Object.assign(process.env, {
    VRT_MODE: 'visual',
    VRT_APP_URL: 'http://127.0.0.1:1234/',
    VRT_OUTPUTS: temp,
    VRT_BASELINES: join(temp, 'baselines'),
    VRT_WS_ENDPOINT: 'ws://127.0.0.1:5678',
    VRT_NETWORK_ORIGINS: '[]',
    VRT_TEST_ROOT: temp,
    VRT_CONFIG_OVERRIDE: join(temp, 'custom.js'),
    VRT_MATCHING: join(temp, 'matching.js'),
    VRT_UPDATE: '0',
  })
  try {
    const {default: config} = await import('./suite-config.js')
    assert.equal(config.testDir, temp)
    assert.equal(config.outputDir, join(temp, 'artifacts'))
    assert.equal(config.updateSnapshots, 'none')
    assert.equal(config.use?.connectOptions?.wsEndpoint, 'ws://127.0.0.1:5678')
    assert.deepEqual(config.use?.viewport, {width: 500, height: 300})
    assert.equal(config.expect?.toHaveScreenshot?.maxDiffPixels, 7)
    assert.equal(config.expect?.toHaveScreenshot?.maxDiffPixelRatio, undefined)
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key]
    Object.assign(process.env, previous)
    rmSync(temp, {recursive: true, force: true})
  }
})

test('compiled component suite preserves remote gallery paths and literal spec filenames', async () => {
  const previous = {...process.env}
  const file = '/compiled/[fixture].browser.spec.js'
  Object.assign(process.env, {
    VRT_MODE: 'component',
    VRT_APP_URL: 'https://preview.example/app/gallery.html?fixture=1',
    VRT_OUTPUTS: '/outputs',
    VRT_WS_ENDPOINT: 'ws://127.0.0.1:5678',
    VRT_NETWORK_ORIGINS: '[]',
    VRT_TEST_ROOT: '/compiled',
    VRT_TEST_FILES: JSON.stringify([file]),
  })
  delete process.env.VRT_CONFIG_OVERRIDE
  delete process.env.VRT_MATCHING
  try {
    const module = new URL('./suite-config.js?component', import.meta.url)
    const config = (await import(module.href)).default
    assert.equal(
      config.use.baseURL,
      'https://preview.example/app/gallery.html?fixture=1'
    )
    assert.equal(config.testMatch[0].test(file), true)
    assert.equal(config.testMatch[0].test('/compiled/f.browser.spec.js'), false)
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key]
    Object.assign(process.env, previous)
  }
})
