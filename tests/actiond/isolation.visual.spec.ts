import {expect, test} from '@playwright/test'
import fs from 'node:fs'
import net from 'node:net'

test('the whole VRT action is offline and can still serve its fixture', async ({page}) => {
  expect(process.platform).toBe('linux')
  expect(process.arch).toBe('x64')
  expect(fs.existsSync('/var/run/docker.sock')).toBe(false)
  // No input-rootfs mapping or packaged libc/Bash runtime was requested.
  for (const file of ['/bin/bash', '/bin/sh', '/usr/bin/env', '/lib64/ld-linux-x86-64.so.2', '/lib/ld-linux-aarch64.so.1'])
    expect(fs.existsSync(file), file).toBe(false)
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
