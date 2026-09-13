// Exercises the shipped capture template and gallery against a real browser.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {spawn} from 'node:child_process'
import {chromium} from 'playwright'
import {testEnvironment} from './isolation.js'

const require = createRequire(import.meta.url)
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-browser-'))
const visuals = fs.readFileSync(new URL('./visuals.js', import.meta.url), 'utf8')
const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html')
  response.end(`<!doctype html><style>body {margin:0}</style><script type="module">
    ${visuals}
    const viewportVisual = (id, viewport) => ({
      visualId: id, name: id, render: () => true,
      beforeCapture() { document.querySelector('#dialog').style.background = 'rgb(255,0,0)' },
      getScreenshotElement() { throw new Error('Viewport must skip element selection') },
      vrt: {capture: 'viewport', viewport, deviceScaleFactor: 2},
    });
    installVisualGallery([{id:'capture', title:'Capture', visuals:[
      viewportVisual('desktop', {width:1280, height:720}),
      viewportVisual('mobile', {width:390, height:844}),
      {visualId:'element', name:'element', render:()=>false, vrt:{deviceScaleFactor:2}},
    ]}], {
      render(fixed) {
        document.body.innerHTML = fixed
          ? '<div id="dialog" style="position:fixed;left:20px;top:100px;width:200px;height:150px;background:blue"></div>'
          : '<div id="root" style="width:200px;height:150px;background:red"></div>';
      },
      unmount() { document.body.innerHTML = '' },
    });
  </script>`)
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const address = server.address()
assert(address && typeof address !== 'string')
let stopBrowser: (() => Promise<unknown>) | undefined
try {
  const executable = process.env.CAPTURE_CHROMIUM_EXECUTABLE
  let endpoint: string
  if (executable) {
    const browser = await chromium.launchServer({executablePath: executable})
    endpoint = browser.wsEndpoint()
    stopBrowser = () => browser.close()
  } else {
    const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as {
      images: {image: string; platform: string | null; roles: string[]}[]
    }
    const browserImage = manifest.images.find(image => image.roles.includes('browser'))!
    const reaperImage = manifest.images.find(image => image.roles.includes('reaper'))!
    // Match the runner: configure the shared helper pin before importing Testcontainers.
    for (const key of Object.keys(process.env))
      if (key.startsWith('TESTCONTAINERS_') || key.startsWith('RYUK_')) delete process.env[key]
    process.env.RYUK_CONTAINER_IMAGE = reaperImage.image
    const {startBrowser} = await import('./container.js')
    const browser = await startBrowser(
      browserImage.image,
      path.dirname(createRequire(require.resolve('playwright/package.json')).resolve('playwright-core/package.json')),
      browserImage.platform!
    )
    endpoint = browser.endpoint
    stopBrowser = browser.stop
  }
  fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}')
  fs.mkdirSync(path.join(temp, 'node_modules', '@playwright'), {recursive:true})
  fs.symlinkSync(path.dirname(fs.realpathSync(require.resolve('@playwright/test/package.json'))),
    path.join(temp, 'node_modules', '@playwright', 'test'))
  for (const name of ['capture', 'visuals'])
    fs.copyFileSync(new URL(`./${name}.js`, import.meta.url), path.join(temp, `${name}.js`))
  const catalog = path.join(temp, 'catalog.json')
  const baseURL = `http://127.0.0.1:${address.port}`
  const connectOptions = {wsEndpoint: endpoint, exposeNetwork: '<loopback>'}
  const run = async (discover: boolean, scale: string) => {
    fs.writeFileSync(path.join(temp, 'config.js'), `export default ${JSON.stringify({
      testDir: temp, testMatch: 'capture.js', workers: 1, timeout: 10000,
      snapshotPathTemplate: path.join(temp, scale, '{arg}{ext}'),
      updateSnapshots: 'all', reporter: 'list',
      use: {baseURL, connectOptions}, expect: {toHaveScreenshot: {scale}},
    })}`)
    const child = spawn(fs.realpathSync(process.env.JS_BINARY__NODE_BINARY || process.execPath), [fs.realpathSync(require.resolve('@playwright/test/cli')),
      'test', '--config', path.join(temp, 'config.js')], {
      stdio:'inherit', env:{...testEnvironment(process.env, [], temp), VRT_DISCOVER: discover ? '1' : '0', VRT_VISUAL_CATALOG:catalog},
    })
    const [code] = await once(child, 'exit')
    assert.equal(code, 0, 'generated capture suite failed')
  }
  await run(true, 'css')
  const browser = await chromium.connect(endpoint)
  try {
    const page = await browser.newPage()
    for (const scale of ['css', 'device']) {
      await run(false, scale)
      for (const [id, width, height] of [
        ['desktop', 1280, 720], ['mobile', 390, 844], ['element', 200, 150],
      ] as const) {
        const png = fs.readFileSync(path.join(temp, scale, `capture-${id}.png`))
        const factor = scale === 'device' ? 2 : 1
        assert.equal(png.readUInt32BE(16), width * factor)
        assert.equal(png.readUInt32BE(20), height * factor)
        const redPixels = await page.evaluate(async data => {
          const image = new Image()
          image.src = data
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = image.width
          canvas.height = image.height
          const context = canvas.getContext('2d')!
          context.drawImage(image, 0, 0)
          const pixels = context.getImageData(0, 0, image.width, image.height).data
          let red = 0
          for (let i = 0; i < pixels.length; i += 4)
            if (pixels[i] === 255 && pixels[i+1] === 0 && pixels[i+2] === 0) red++
          return red
        }, 'data:image/png;base64,' + png.toString('base64'))
        assert.equal(redPixels, 200 * 150 * factor * factor, `${id}/${scale} content`)
      }
    }
  } finally {
    await browser.close()
  }
} finally {
  await stopBrowser?.()
  server.closeAllConnections()
  server.close()
  fs.rmSync(temp, {recursive:true, force:true})
}
