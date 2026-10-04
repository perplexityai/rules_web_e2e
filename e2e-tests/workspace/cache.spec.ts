import {expect, test} from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test('declared app and mocked API', async ({page}) => {
  const inputs = JSON.parse(process.env.CACHE_INPUTS!) as {app: string, mock: string}
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== 'https://fixture.invalid') throw new Error(`Unexpected request: ${url}`)
    if (url.pathname === '/') {
      await route.fulfill({contentType: 'text/html', body: fs.readFileSync(inputs.app, 'utf8')})
    } else if (url.pathname === '/api') {
      await route.fulfill({contentType: 'application/json', body: fs.readFileSync(inputs.mock, 'utf8')})
    } else throw new Error(`Unexpected request: ${url}`)
  })
  await page.goto('https://fixture.invalid/')
  await expect(page.locator('#result')).toHaveText(JSON.parse(fs.readFileSync(inputs.mock, 'utf8')).message)
  fs.writeFileSync(path.join(process.env.VRT_OUTPUTS!, 'executed.txt'), 'executed')
})
