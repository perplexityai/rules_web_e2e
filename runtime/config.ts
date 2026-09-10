import path from 'node:path'
import {networkTargets} from './network.js'
import type {PlaywrightTestConfig} from '@playwright/test'

export interface BrowserConfigOptions {
  root: string
  viewport?: {width: number; height: number}
}

export interface ComponentBrowserConfigOptions extends BrowserConfigOptions {
  /** Gallery path relative to the application URL, or a URL on the same origin. */
  gallery: string
}

export interface VisualConfigOptions extends BrowserConfigOptions {
  tolerance?: number
}

function required(name: string): string {
  const value = process.env[name]
  if (!value)
    throw new Error(`Missing ${name}; run the VRT target through Bazel`)
  return value
}

/** Native Playwright E2E defaults for a consumer-owned server. */
export function e2eConfig({
  root,
  viewport = {width: 1280, height: 720},
}: BrowserConfigOptions): PlaywrightTestConfig {
  return {
    testDir: root,
    testMatch: '**/*.spec.ts',
    testIgnore: ['**/*.visual.spec.ts', '**/*.browser.spec.{ts,tsx}'],
    forbidOnly: true,
    retries: 0,
    workers: 1,
    timeout: 30_000,
    updateSnapshots: 'none',
    outputDir: path.join(required('VRT_OUTPUTS'), 'artifacts'),
    reporter: [
      ['list'],
      ['junit', {outputFile: path.join(required('VRT_OUTPUTS'), 'junit.xml')}],
    ],
    use: {
      baseURL: required('VRT_APP_URL'),
      browserName: 'chromium',
      headless: true,
      viewport,
      contextOptions: {reducedMotion: 'reduce'},
      locale: 'en-US',
      timezoneId: 'UTC',
      colorScheme: 'light',
      trace: 'retain-on-failure',
      screenshot: 'only-on-failure',
      connectOptions: {
        wsEndpoint: required('VRT_WS_ENDPOINT'),
        exposeNetwork: networkTargets(
          required('VRT_APP_URL'),
          JSON.parse(required('VRT_NETWORK_ORIGINS')) as string[]
        ),
      },
    },
  }
}

/** Screenshot-specific policy on top of the common browser execution settings. */
export function visualConfig({
  root,
  viewport,
  tolerance = 0,
}: VisualConfigOptions): PlaywrightTestConfig {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1)
    throw new Error('tolerance must be a pixel mismatch ratio between 0 and 1')
  return {
    ...e2eConfig({root, viewport}),
    testMatch: '**/.rules-visual.spec.ts',
    testIgnore: [],
    updateSnapshots: process.env.VRT_UPDATE === '1' ? 'all' : 'none',
    snapshotPathTemplate: path.join(required('VRT_BASELINES'), '{arg}{ext}'),
    expect: {
      toHaveScreenshot: {
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        threshold: 0.1,
        maxDiffPixelRatio: tolerance,
      },
    },
  }
}

/** Native mount fixtures with consumer-owned gallery rendering and providers. */
export function componentBrowserConfig({
  gallery,
  ...options
}: ComponentBrowserConfigOptions): PlaywrightTestConfig {
  const defaults = e2eConfig(options)
  const base = new URL(defaults.use!.baseURL!)
  if (!gallery.trim()) throw new Error('Component gallery must not be empty')
  const url = new URL(gallery, base)
  if (url.origin !== base.origin || url.username || url.password || url.hash)
    throw new Error(
      'Component gallery must stay on the application origin without credentials or fragments'
    )
  return {
    ...defaults,
    testMatch: '**/*.browser.spec.{ts,tsx}',
    testIgnore: '**/*.visual.spec.ts',
    use: {
      ...defaults.use,
      baseURL: url.href,
      serviceWorkers: 'block',
    },
  }
}
