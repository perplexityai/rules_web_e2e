import {expect, test} from '@playwright/test'
import {createServer} from 'node:http'

test('browser can reach the fixture but cannot tunnel to unrelated host ports', async ({
  page,
}) => {
  let requests = 0
  const unrelated = createServer((_, response) => {
    requests++
    response.end('undeclared service')
  })
  await new Promise<void>(resolve => unrelated.listen(0, '127.0.0.1', resolve))
  try {
    const address = unrelated.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing test server port')
    const url = `http://127.0.0.1:${address.port}/`
    expect(await (await fetch(url)).text()).toBe('undeclared service')
    requests = 0
    await page.goto(process.env.VRT_APP_URL!)
    await expect(
      page.getByRole('button', {name: 'Save', exact: true})
    ).toBeVisible()
    await expect(page.goto(url, {timeout: 2000})).rejects.toThrow()
    expect(requests).toBe(0)
  } finally {
    await new Promise<void>((resolve, reject) =>
      unrelated.close(error => (error ? reject(error) : resolve()))
    )
  }
})

test('browser cannot reach the public network directly', async ({page}) => {
  await expect(page.goto('http://1.1.1.1/', {timeout: 2000})).rejects.toThrow()
})
