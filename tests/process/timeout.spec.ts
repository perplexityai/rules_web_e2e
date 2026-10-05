import {setTimeout} from 'node:timers/promises'
import {test, expect} from '@playwright/test'

test('Bazel deadline overrides the standalone one-second execution limit', async () => {
  await setTimeout(1500)
  expect(process.env.TEST_TIMEOUT).toBeUndefined() // Execution settings stay outside caller fixtures.
})
