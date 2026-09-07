import path from 'node:path'
import type {PlaywrightTestConfig} from '@playwright/test'

export interface VisualConfigOptions {
  root: string
  viewport?: {width: number; height: number}
  tolerance?: number
}

function required(name: string): string {
  const value = process.env[name]
  if (!value)
    throw new Error(`Missing ${name}; run the VRT target through Bazel`)
  return value
}

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'"
}

/** Playwright Test defaults for a consumer-owned Vite application. */
export function visualConfig({
  root,
  viewport = {width: 1280, height: 720},
  tolerance = 0,
}: VisualConfigOptions): PlaywrightTestConfig {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
    throw new Error('tolerance must be a pixel mismatch ratio between 0 and 1')
  }
  return {
    testDir: root,
    testMatch: '**/*.visual.spec.ts',
    forbidOnly: true,
    retries: 0,
    workers: 1,
    timeout: 30_000,
    updateSnapshots: process.env.VRT_UPDATE === '1' ? 'all' : 'none',
    snapshotPathTemplate: path.join(required('VRT_BASELINES'), '{arg}{ext}'),
    outputDir: path.join(required('VRT_OUTPUTS'), 'artifacts'),
    reporter: [
      ['list'],
      ['junit', {outputFile: path.join(required('VRT_OUTPUTS'), 'junit.xml')}],
    ],
    expect: {
      toHaveScreenshot: {
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        threshold: 0.1,
        maxDiffPixelRatio: tolerance,
      },
    },
    use: {
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
        exposeNetwork: '<loopback>',
      },
    },
    webServer: {
      command: `${shellQuote(required('VRT_SERVER'))} --config ${shellQuote(required('VRT_SERVER_CONFIG'))} --host 127.0.0.1 --port 0`,
      cwd: root,
      wait: {stdout: /Local:\s+(?<vrt_app_url>http:\/\/127\.0\.0\.1:\d+\/)/},
      env: {NO_COLOR: '1', FORCE_COLOR: '0'},
      timeout: 30_000,
      reuseExistingServer: false,
      gracefulShutdown: {signal: 'SIGTERM', timeout: 5_000},
    },
  }
}
