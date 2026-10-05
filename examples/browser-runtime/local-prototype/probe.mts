// Experimental Linux namespace probe, run by the bundled Node 24.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import {chromium} from '/playwright/index.mjs'

for (const absent of ['/etc/ld.so.cache', '/usr/share/fonts', '/etc/resolv.conf', '/dev/kvm']) assert(!fs.existsSync(absent), absent)
if (process.env.PROBE_EXPECT_MISSING_LIBRARY === '1') {
  await assert.rejects(async () => {
    const browser = await chromium.launch({executablePath: '/runtime/chromium/chrome-headless-shell', chromiumSandbox: true})
    await browser.close()
  }, /libnss3\.so:.*(?:cannot open shared object file|file too short)/)
  console.log('Missing bundled libnss3.so prevents launch; no host fallback')
} else {
  const server = http.createServer((_, res) => res.end('<!doctype html><style>body{font-family:"DejaVu Sans"}button{font:inherit}</style><button onclick="this.textContent=\'Saved\'">Save</button>'))
  await new Promise<void>(resolve => server.listen(8080, '127.0.0.1', resolve))
  try {
    const browser = await chromium.launch({executablePath: '/runtime/chromium/chrome-headless-shell', chromiumSandbox: true})
    try {
      const page = await browser.newPage({viewport: {width: 800, height: 600}})
      await page.goto('http://127.0.0.1:8080')
      await page.getByRole('button', {name: 'Save', exact: true}).click()
      assert.equal(await page.locator('button').textContent(), 'Saved')
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('DOM.enable')
      await cdp.send('CSS.enable')
      const {root} = await cdp.send('DOM.getDocument')
      const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector: 'button'})
      const {fonts} = await cdp.send('CSS.getPlatformFontsForNode', {nodeId})
      assert(fonts.some(font => font.familyName === 'DejaVu Sans'), JSON.stringify(fonts))
      fs.writeFileSync('/output/fonts.json', JSON.stringify(fonts, null, 2))
      await page.screenshot({path: '/output/page.png'})
      const processes = []
      for (const pid of fs.readdirSync('/proc').filter(p => /^\d+$/.test(p))) {
        try {
          processes.push({pid, command: fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'), status: fs.readFileSync(`/proc/${pid}/status`, 'utf8'), maps: fs.readFileSync(`/proc/${pid}/maps`, 'utf8')})
        } catch {} // Chromium can exit helpers while inspecting /proc.
      }
      const applications = processes.filter(p => p.command.startsWith('/bin/node\0') || p.command.startsWith('/runtime/chromium/'))
      const renderers = applications.filter(p => p.command.includes('--type=renderer'))
      assert(renderers.length > 0, 'Expected a live renderer')
      assert(renderers.every(p => /^Seccomp:\s+2$/m.test(p.status)), 'Renderer seccomp must remain enabled')
      for (const process of applications) {
        for (const line of process.maps.split('\n')) {
          const mapped = line.trim().split(/\s+/).slice(5).join(' ')
          if (mapped.startsWith('/')) assert(/^\/(lib|runtime|bin|tmp)\//.test(mapped), mapped)
        }
      }
      const interfaces = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2).filter(line => line.includes(':')).map(line => line.split(':')[0].trim())
      assert.deepEqual(interfaces, ['lo'])
      fs.writeFileSync('/output/processes.json', JSON.stringify(processes, null, 2))
      console.log(JSON.stringify({version: browser.version(), interaction: 'passed', screenshot: '/output/page.png', chromiumSandbox: true, processes: processes.length}))
    } finally { await browser.close() }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }

}
