export function validatePlaywrightVersions(
  configured: string,
  testVersion: string,
  coreVersion: string
): void {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(configured)
  if (!match || +match[1] < 1 || (+match[1] === 1 && +match[2] < 63))
    throw new Error('Playwright >= 1.63.0 (stable release) is required')
  if (testVersion !== configured || coreVersion !== configured)
    throw new Error(
      `Playwright version mismatch: configured ${configured}, test ${testVersion}, core ${coreVersion}`
    )
}
