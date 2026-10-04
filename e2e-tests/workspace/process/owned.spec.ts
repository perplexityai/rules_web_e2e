import {test, expect} from '@playwright/test'
import {chromium, _electron as electron, type Page} from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'

// Record the real process tree, including browsers launched into separate groups.
function descendants() {
  const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], {encoding: 'utf8'})
    .trim().split('\n').map(line => line.trim().split(/\s+/).map(Number))
  const pids = new Set([process.pid])
  for (let changed = true; changed;) {
    changed = false
    for (const [pid, parent] of rows) {
      if (pids.has(parent) && !pids.has(pid)) { pids.add(pid); changed = true }
    }
  }
  pids.delete(process.pid)
  return [...pids]
}

test('caller-owned process renders and preserves its profile', async () => {
  test.setTimeout(0)
  expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBeUndefined()
  const profile = path.join(process.env.TEST_TMPDIR!, 'owned-profile')
  const output = process.env.VRT_OUTPUTS!
  const executablePath = fs.realpathSync(process.env.OWNED_EXECUTABLE!)
  let page: Page
  let close: () => Promise<void>
  let browserPid: number | undefined
  if (process.env.OWNED_KIND === 'electron') {
    console.log('Launching declared Electron executable')
    const app = await electron.launch({
      executablePath, args: ['--no-sandbox', path.resolve(process.env.OWNED_APP!)],
      env: {...process.env, OWNED_PROFILE: profile} as Record<string, string>,
    })
    browserPid = app.process().pid
    console.log('Electron launched; waiting for first window')
    page = await app.firstWindow()
    console.log('Electron window ready')
    close = () => app.close()
  } else {
    const initial = await chromium.launchPersistentContext(profile, {executablePath, headless: true})
    try {
      await initial.addCookies([{name: 'profile', value: 'retained', domain: 'example.test', path: '/', expires: Math.floor(Date.now() / 1000) + 3600}])
    } finally {
      await initial.close()
    }
    const context = await chromium.launchPersistentContext(profile, {executablePath, headless: true})
    expect((await context.cookies()).find(cookie => cookie.name === 'profile')?.value).toBe('retained')
    page = context.pages()[0]
    await page.goto('data:text/html,<button onclick="this.textContent=\'Saved\'">Save</button>')
    close = () => context.close()
  }
  page.setDefaultTimeout(10_000)
  try {
    await page.getByRole('button', {name: 'Save', exact: true}).click()
    await expect(page.getByRole('button', {name: 'Saved', exact: true})).toBeVisible()
    await page.screenshot({path: path.join(output, 'browser.png')})
    expect(fs.existsSync(profile)).toBe(true)
    const pids = descendants()
    expect(pids.length).toBeGreaterThan(0)
    if (browserPid) expect(pids).toContain(browserPid)
    fs.writeFileSync(path.join(profile, 'private-state'), 'fixture-only')
    fs.writeFileSync(path.join(output, 'processes.json'), JSON.stringify({
      pids, scratch: process.env.TEST_TMPDIR, profile,
    }))
    if (process.env.OWNED_HANG === '1') await new Promise(() => {})
  } finally {
    await close()
  }
})
