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


/** Require the browser tested by the selected Playwright package. */
export function validateChromiumVersion(registry: {
  browsers: {name: string; browserVersion?: string}[]
}, actual: string): void {
  const expected = registry.browsers.find(browser => browser.name === 'chromium-headless-shell')?.browserVersion
  const version = actual.match(/\b\d+\.\d+\.\d+\.\d+\b/)?.[0]
  if (!expected || version !== expected)
    throw new Error(`Chromium version mismatch: Playwright expects ${expected || 'a declared headless-shell version'}, got ${version || actual.trim()}. Update the caller's Chromium pin or Playwright packages together.`)
}
