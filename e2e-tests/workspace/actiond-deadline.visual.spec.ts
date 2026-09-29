import {expect, test} from '@playwright/test'
import path from 'node:path'

test('capture evidence before the runner event loop stalls', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button', {name: 'Save', exact: true})).toBeVisible()
  await page.screenshot({path: path.join(process.env.VRT_OUTPUTS!, 'deadline-ready.png')})
  await new Promise(() => {})
})
