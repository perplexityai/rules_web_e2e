import assert from 'node:assert/strict'
import {test} from 'node:test'
import {componentBrowserConfig} from './config.js'

test('component gallery resolves base paths for host browser launch', () => {
  const previous = {...process.env}
  Object.assign(process.env, {
    VRT_APP_URL: 'https://preview.example/app/',
    VRT_OUTPUTS: '/tmp/results',
    VRT_WS_ENDPOINT: 'ws://127.0.0.1:1234',
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
    assert.equal(config.use?.connectOptions, undefined)
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
  const {mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync} =
    await import('node:fs')
  const {tmpdir} = await import('node:os')
  const {join} = await import('node:path')
  const temp = mkdtempSync(join(tmpdir(), 'suite-config-'))
  const previous = {...process.env}
  writeFileSync(join(temp, 'package.json'), '{"type":"module"}')
  writeFileSync(join(temp, 'matching.js'), 'export default {maxDiffPixels: 7}')
  writeFileSync(join(temp, 'reporter.js'), 'export default class Reporter {}')
  writeFileSync(
    join(temp, 'setup.js'),
    'export default async function setup() {}'
  )
  writeFileSync(
    join(temp, 'custom.js'),
    `export default {
    outputDir: '/wrong', updateSnapshots: 'all',
    globalSetup: './setup.js', globalTeardown: ['./setup.js'],
    webServer: [{command: 'node app.js', port: 8080, reuseExistingServer: true},
      {command: 'node api.js', port: 8081, cwd: './backend'}],
    expect: {toHaveScreenshot: {scale: 'device', maxDiffPixels: 999}},
    reporter: [['./reporter.js', {project: 'example'}], ['json', {outputFile: 'extra.json'}]],
    use: {connectOptions: {wsEndpoint: 'ws://wrong'}, viewport: {width: 500, height: 300}}
  }`
  )
  Object.assign(process.env, {
    VRT_MODE: 'visual',
    VRT_APP_URL: 'http://127.0.0.1:1234/',
    VRT_OUTPUTS: temp,
    VRT_BASELINES: join(temp, 'baselines'),
    VRT_CHROMIUM_EXECUTABLE: '/runtime/chromium',
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
    assert.deepEqual(config.webServer, [
      {
        command: 'node app.js',
        port: 8080,
        cwd: temp,
        reuseExistingServer: false,
      },
      {
        command: 'node api.js',
        port: 8081,
        cwd: join(temp, 'backend'),
        reuseExistingServer: false,
      },
    ])
    assert.deepEqual(config.globalSetup, [realpathSync(join(temp, 'setup.js'))])
    assert.deepEqual(config.globalTeardown, [
      realpathSync(join(temp, 'setup.js')),
    ])
    assert.deepEqual(config.reporter, [
      ['list'],
      ['junit', {outputFile: join(temp, 'junit.xml')}],
      [realpathSync(join(temp, 'reporter.js')), {project: 'example'}],
      ['json', {outputFile: 'extra.json'}],
    ])
    assert.equal(config.use?.connectOptions, undefined)
    assert.equal(config.use?.launchOptions?.executablePath, '/runtime/chromium')
    assert.deepEqual(config.use?.viewport, {width: 500, height: 300})
    assert.equal(config.expect?.toHaveScreenshot?.maxDiffPixels, 7)
    assert.equal(config.expect?.toHaveScreenshot?.scale, 'device')
    assert.equal(config.expect?.toHaveScreenshot?.maxDiffPixelRatio, undefined)
    const reporterPackage = join(temp, 'node_modules', 'consumer-reporter')
    mkdirSync(reporterPackage, {recursive: true})
    writeFileSync(
      join(reporterPackage, 'package.json'),
      '{"type":"module","exports":"./index.js"}'
    )
    writeFileSync(
      join(reporterPackage, 'index.js'),
      'export default class Reporter {}'
    )
    writeFileSync(
      join(temp, 'package-config.js'),
      "export default {reporter: 'consumer-reporter'}"
    )
    process.env.VRT_CONFIG_OVERRIDE = join(temp, 'package-config.js')
    const packageConfig = (
      await import(
        new URL('./suite-config.js?reporter-package', import.meta.url).href
      )
    ).default
    assert.equal(packageConfig.expect?.toHaveScreenshot?.scale, 'css')
    assert.deepEqual(packageConfig.reporter, [
      ['list'],
      ['junit', {outputFile: join(temp, 'junit.xml')}],
      [realpathSync(join(reporterPackage, 'index.js'))],
    ])
    // Consumer launch/connection overrides must not replace a declared browser.
    writeFileSync(join(temp, 'declared.js'), `export default {use: {
      connectOptions: {wsEndpoint: 'ws://elsewhere'},
      launchOptions: {executablePath: '/host/chrome', args: ['--proxy-server=elsewhere']},
      viewport: {width: 800, height: 600}
    }}`)
    process.env.VRT_CONFIG_OVERRIDE = join(temp, 'declared.js')
    process.env.VRT_CHROMIUM_EXECUTABLE = '/inputs/runtime/chrome'
    delete process.env.VRT_WS_ENDPOINT
    const declared = (await import(new URL('./suite-config.js?declared', import.meta.url).href)).default
    assert.equal(declared.use.connectOptions, undefined)
    assert.deepEqual(declared.use.launchOptions, {
      executablePath: '/inputs/runtime/chrome',
      chromiumSandbox: false,
      args: ['--no-zygote'],
    })
    assert.deepEqual(declared.use.viewport, {width: 800, height: 600})
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
    VRT_CHROMIUM_EXECUTABLE: '/runtime/chromium',
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
    assert.equal(config.use.connectOptions, undefined)
    assert.equal(config.testMatch[0].test(file), true)
    assert.equal(config.testMatch[0].test('/compiled/f.browser.spec.js'), false)
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key]
    Object.assign(process.env, previous)
  }
})


test('host suites reject remote connection overrides at config and project scope', async () => {
  const {mkdtempSync, writeFileSync, rmSync} = await import('node:fs')
  const {tmpdir} = await import('node:os')
  const {join} = await import('node:path')
  const temp = mkdtempSync(join(tmpdir(), 'host-config-'))
  const previous = {...process.env}
  Object.assign(process.env, {
    VRT_MODE: 'e2e', VRT_APP_URL: 'http://localhost:1234', VRT_OUTPUTS: temp,
    VRT_TEST_ROOT: temp, VRT_TEST_FILES: JSON.stringify([join(temp, 'app.spec.js')]),
  })
  delete process.env.VRT_WS_ENDPOINT
  delete process.env.VRT_MATCHING
  try {
    writeFileSync(join(temp, 'package.json'), '{"type":"module"}')
    for (const [index, custom] of [
      {use: {connectOptions: {wsEndpoint: 'ws://elsewhere'}}},
      {projects: [{name: 'remote', use: {connectOptions: {wsEndpoint: 'ws://elsewhere'}}}]},
    ].entries()) {
      process.env.VRT_CONFIG_OVERRIDE = join(temp, `config-${index}.js`)
      writeFileSync(process.env.VRT_CONFIG_OVERRIDE, `export default ${JSON.stringify(custom)}`)
      await assert.rejects(import(new URL(`./suite-config.js?host-${index}`, import.meta.url).href), /launch host browsers/)
    }
    delete process.env.VRT_CONFIG_OVERRIDE
    const config = (await import(new URL('./suite-config.js?host-default', import.meta.url).href)).default
    assert.equal(config.use.connectOptions, undefined)
    assert.equal(config.use.browserName, 'chromium')
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
    Object.assign(process.env, previous)
    rmSync(temp, {recursive: true, force: true})
  }
})

test('suite config rejects explicit native discovery instead of broadening selection', async () => {
  const {mkdtempSync, writeFileSync, rmSync} = await import('node:fs')
  const {tmpdir} = await import('node:os')
  const {join} = await import('node:path')
  const temp = mkdtempSync(join(tmpdir(), 'selection-config-'))
  const previous = {...process.env}
  writeFileSync(join(temp, 'package.json'), '{"type":"module"}')
  Object.assign(process.env, {
    VRT_MODE: 'e2e', VRT_APP_URL: 'http://localhost:1234',
    VRT_OUTPUTS: temp, VRT_WS_ENDPOINT: 'ws://localhost:5678',
    VRT_TEST_ROOT: temp,
    VRT_TEST_FILES: JSON.stringify([join(temp, 'auth.spec.js'), join(temp, 'app.spec.js')]),
  })
  delete process.env.VRT_MATCHING
  try {
    const cases = [
      {testMatch: '*.spec.ts'},
      {testIgnore: []},
      {testDir: '.'},
      {projects: [{name: 'setup', testMatch: '*.spec.js'}, {name: 'app', dependencies: ['setup']}]},
      {projects: [{name: 'app', testIgnore: '*.spec.js'}]},
      {projects: [{name: 'app', testDir: './app'}]},
    ]
    for (const [index, custom] of cases.entries()) {
      process.env.VRT_CONFIG_OVERRIDE = join(temp, `config-${index}.js`)
      writeFileSync(process.env.VRT_CONFIG_OVERRIDE, `export default ${JSON.stringify(custom)}`)
      await assert.rejects(
        import(new URL(`./suite-config.js?selection-${index}`, import.meta.url).href),
        /unsupported: select compiled specs with the Bazel tests attribute/
      )
    }
    process.env.VRT_CONFIG_OVERRIDE = join(temp, 'allowed.js')
    writeFileSync(process.env.VRT_CONFIG_OVERRIDE,
      "export default {projects: [{name: 'desktop'}, {name: 'mobile', use: {viewport: {width: 390, height: 844}}}]}")
    const {default: config} = await import(new URL('./suite-config.js?selection-allowed', import.meta.url).href)
    for (const project of config.projects) {
      const selected = ['auth', 'app', 'undeclared'].filter(name =>
        project.testMatch.some((pattern: RegExp) => pattern.test(join(temp, `${name}.spec.js`))))
      assert.deepEqual(selected, ['auth', 'app'])
    }
    assert.deepEqual(config.projects[1].use.viewport, {width: 390, height: 844})
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key]
    Object.assign(process.env, previous)
    rmSync(temp, {recursive: true, force: true})
  }
})
