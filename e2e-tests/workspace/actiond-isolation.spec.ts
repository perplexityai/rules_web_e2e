import {expect, test} from '@playwright/test'
import fs from 'node:fs'
import {lookup} from 'node:dns/promises'
import net from 'node:net'
import os from 'node:os'

test('the whole VRT action is offline and can still serve its fixture', async ({page}) => {
  expect(process.platform).toBe('linux')
  expect(process.arch).toBe(process.env.ACTIOND_ARCH)
  expect(fs.existsSync('/var/run/docker.sock')).toBe(false)
  // Standard ELF loading comes from the pinned worker, not rewritten inputs.
  expect(fs.existsSync('/bin/bash')).toBe(true)
  expect(fs.existsSync(process.arch === 'x64'
    ? '/lib64/ld-linux-x86-64.so.2' : '/lib/ld-linux-aarch64.so.1')).toBe(true)
  const fixture = JSON.parse(process.env.ACTIOND_FIXTURE!)
  expect(JSON.parse(fs.readFileSync(fixture.package, 'utf8')).name).toBeTruthy()
  const error = await new Promise<NodeJS.ErrnoException>(resolve => {
    const socket = net.connect({host: '1.1.1.1', port: 443})
    socket.once('connect', () => {
      socket.destroy()
      resolve(new Error('External connection unexpectedly succeeded'))
    })
    socket.once('error', resolve)
    socket.setTimeout(2000, () => {
      socket.destroy()
      resolve(new Error('Connection timed out instead of being isolated'))
    })
  })
  expect(error.code).toBe('ENETUNREACH')
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Save', exact: true})).toBeVisible()
  await expect(page.goto('http://1.1.1.1/', {timeout: 2000})).rejects.toThrow()
})

test('local execution uses bundled files and a sandboxed renderer', async ({page}) => {
  test.skip(process.env.VRT_EXECUTION !== 'local')
  for (const absent of ['/usr/share/fonts', '/etc/ld.so.cache', '/etc/resolv.conf', '/dev/kvm', '/etc/passwd'])
    expect(fs.existsSync(absent), absent).toBe(false)
  expect(process.env.LOCAL_HOST_SENTINEL).toBeUndefined()
  expect(process.getuid!()).toBe(1000)
  expect(process.getgid!()).toBe(1000)
  expect(os.hostname()).toBe('bazel-browser')
  expect((await lookup('localhost', {family: 4})).address).toBe('127.0.0.1')
  expect((await lookup(os.hostname(), {family: 4})).address).toBe('127.0.0.1')
  await page.setContent('<style>body{font-family:"DejaVu Sans"}</style><p>Declared font</p>')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const {root} = await cdp.send('DOM.getDocument')
  const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector: 'p'})
  const {fonts} = await cdp.send('CSS.getPlatformFontsForNode', {nodeId})
  expect(fonts.some(font => font.familyName === 'DejaVu Sans')).toBe(true)
  const processes: {command: string, maps: string, status: string}[] = []
  for (const pid of fs.readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
    try {
      processes.push({command: fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'), maps: fs.readFileSync(`/proc/${pid}/maps`, 'utf8'), status: fs.readFileSync(`/proc/${pid}/status`, 'utf8')})
    } catch {} // Helpers may exit while /proc is read.
  }
  fs.writeFileSync(`${process.env.TEST_UNDECLARED_OUTPUTS_DIR}/local-dependencies.json`, JSON.stringify({fonts, processes}, null, 2))
  const browsers = processes.filter(process => process.command.includes('/chrome-headless-shell'))
  const renderers = browsers.filter(process => process.command.includes('--type=renderer'))
  expect(renderers.length).toBeGreaterThan(0)
  for (const renderer of renderers) expect(renderer.status).toMatch(/^Seccomp:\s+2$/m)
  for (const process of browsers) {
    for (const line of process.maps.split('\n')) {
      const file = line.trim().split(/\s+/).slice(5).join(' ')
      if (file.startsWith('/')) expect(file).toMatch(/^\/(lib|runfiles|tmp)\//)
    }
  }
})
