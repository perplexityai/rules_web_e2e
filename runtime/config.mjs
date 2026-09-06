import path from 'node:path'
import {installVitestBridge} from './browser-channel.mjs'

/** Merge these defaults with consumer Vite plugins, aliases, and test include. */
export function visualConfig({
  provider,
  root,
  viewport = {width: 1280, height: 720},
  tolerance = 0,
}) {
  if (
    !process.env.VRT_WS_ENDPOINT ||
    !process.env.VRT_BASELINES ||
    !process.env.VRT_OUTPUTS
  ) {
    throw new Error(
      'Run component_visual_test or its .update target through Bazel.'
    )
  }
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
    throw new Error('tolerance must be a pixel mismatch ratio between 0 and 1')
  }
  const bridge = `(${installVitestBridge.toString()})();`
  return {
    root,
    plugins: [
      {
        name: 'rules-web-e2e:vitest-channel',
        transformIndexHtml: {
          order: 'pre',
          handler: () => [
            {tag: 'script', children: bridge, injectTo: 'head-prepend'},
          ],
        },
      },
    ],
    cacheDir: process.env.VRT_CACHE,
    server: {host: '127.0.0.1', watch: null},
    test: {
      watch: false,
      update: process.env.VRT_UPDATE === '1',
      attachmentsDir: process.env.VRT_OUTPUTS,
      reporters: [
        'default',
        [
          'junit',
          {outputFile: path.join(process.env.VRT_OUTPUTS, 'junit.xml')},
        ],
      ],
      testTimeout: 30_000,
      browser: {
        enabled: true,
        orchestratorScripts: [{content: bridge, type: 'text/javascript'}],
        headless: true,
        viewport,
        provider: provider({
          connectOptions: {
            wsEndpoint: process.env.VRT_WS_ENDPOINT,
            exposeNetwork: '<loopback>',
          },
          contextOptions: {
            reducedMotion: 'reduce',
            locale: 'en-US',
            timezoneId: 'UTC',
            colorScheme: 'light',
          },
        }),
        instances: [{browser: 'chromium'}],
        screenshotFailures: false,
        screenshotDirectory: process.env.VRT_BASELINES,
        expect: {
          toMatchScreenshot: {
            resolveScreenshotPath: ({arg, ext}) => {
              if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(arg)) {
                throw new Error(
                  'Screenshot names must be simple filenames without directories'
                )
              }
              return path.join(process.env.VRT_BASELINES, `${arg}${ext}`)
            },
            screenshotOptions: {
              animations: 'disabled',
              caret: 'hide',
              scale: 'css',
            },
            comparatorOptions: {
              threshold: 0.1,
              allowedMismatchedPixelRatio: tolerance,
            },
          },
        },
      },
    },
  }
}
