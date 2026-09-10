/** Screenshot comparison policy, independent of rendering and baseline ownership. */
export interface VisualMatching {
  threshold?: number
  maxDiffPixels?: number
  maxDiffPixelRatio?: number
}

export function screenshotMatching(value: VisualMatching = {}): VisualMatching {
  for (const [name, number] of Object.entries(value)) {
    if (!['threshold', 'maxDiffPixels', 'maxDiffPixelRatio'].includes(name))
      throw new Error(`Unknown VRT matching option: ${name}`)
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0)
      throw new Error(`Invalid VRT matching option: ${name}`)
    if (name === 'maxDiffPixels' ? !Number.isInteger(number) : number > 1)
      throw new Error(`Invalid VRT matching option: ${name}`)
  }
  if (
    value.maxDiffPixels !== undefined &&
    value.maxDiffPixelRatio !== undefined
  )
    throw new Error('Choose maxDiffPixels or maxDiffPixelRatio, not both')
  return {
    threshold: 0.1,
    ...(value.maxDiffPixels === undefined ? {maxDiffPixelRatio: 0} : {}),
    ...value,
  }
}
