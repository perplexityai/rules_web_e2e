import {expect, test} from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test('optional foreign runfiles do not prevent browser capture', async ({page}) => {
  const root = path.join(process.env.VRT_INPUTS!, '_main/platform')
  expect(fs.existsSync(path.join(root, 'optional-darwin-binding'))).toBe(false)
  const foreign = fs.readFileSync(path.join(root, 'foreign-elf32'))
  expect([...foreign.subarray(0, 6)]).toEqual([0x7f, 0x45, 0x4c, 0x46, 1, 1])
  expect(foreign.length).toBe(64)
  expect(foreign.subarray(6).every(byte => byte === 0)).toBe(true)
  await page.goto('/')
  await page.getByRole('button', {name: 'Save', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Saved', exact: true})).toBeVisible()
  await expect(page.getByRole('button')).toHaveScreenshot('platform.png')
})
