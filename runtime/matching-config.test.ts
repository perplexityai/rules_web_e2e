import assert from 'node:assert/strict'
import {test} from 'node:test'
import {screenshotMatching} from './matching.js'

test('declared comparison policies use the same defaults and validation as compiled modules', async () => {
  for (const [name, expected] of [
    ['matching_defaults', {threshold: 0.1, maxDiffPixelRatio: 0}],
    ['matching_ratio', {threshold: 0.2, maxDiffPixelRatio: 0.01}],
    ['matching_count', {threshold: 0.1, maxDiffPixels: 5}],
  ] as const) {
    const {default: matching} = await import(`./${name}.mjs`)
    assert.deepEqual(screenshotMatching(matching), expected)
  }
  for (const name of [
    'matching_empty',
    'matching_nonfinite',
    'matching_null',
    'matching_out_of_range',
    'matching_fractional_count',
    'matching_conflicting_budgets',
  ]) {
    await assert.rejects(async () => {
      const {default: matching} = await import(`./${name}.mjs`)
      screenshotMatching(matching)
    }, {message: /JSON|VRT matching option|Choose maxDiffPixels/})
  }
})
