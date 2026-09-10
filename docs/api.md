# API reference

Use the [getting started guide](getting-started.md) for a complete consumer
example. These APIs run through Bazel; the configuration helpers require the
environment supplied by the runner and cannot be invoked directly with `playwright test`.

## Bazel macros

| Load path                            | Macro                    | Config helper            | Generated targets         |
| ------------------------------------ | ------------------------ | ------------------------ | ------------------------- |
| `@rules_web_e2e//e2e:defs.bzl`       | `web_e2e_test`           | `e2eConfig`              | `<name>`                  |
| `@rules_web_e2e//component:defs.bzl` | `component_browser_test` | `componentBrowserConfig` | `<name>`                  |
| `@rules_web_e2e//vrt:defs.bzl`       | `component_visual_test`  | `visualConfig`           | `<name>`, `<name>.update` |

All macros also create `<name>_sources` for their declared inputs. Do not define
another target with that name. The following attributes are shared; arbitrary
`js_test` attributes are not forwarded.

| Attribute                   | Type / default          | Contract                                                                           |
| --------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `name`                      | Required string         | Bazel target name                                                                  |
| `config`                    | Required label          | Consumer Playwright TypeScript config                                              |
| `srcs`                      | Required label list     | Specs, visual modules, entrypoints, HTML, and package metadata                     |
| `playwright_test`           | Required label          | Consumer `@playwright/test` npm `/dir` target                                      |
| `playwright_core`           | Required label          | Matching `playwright-core` npm `/dir` target                                       |
| `deps`                      | Label list, `[]`        | Runtime npm links and transitive JS libraries                                      |
| `data`                      | Label list, `[]`        | Assets, generated inputs, and the consumer typecheck target                        |
| `server`                    | Label, unset            | Compiled module exporting a default `ServerAdapter`                                |
| `vite`, `server_config`     | Labels, unset           | Vite npm `/dir` target and consumer Vite config; supply both                       |
| `base_url`                  | String, unset           | Existing HTTP(S) app URL; caller owns readiness and lifetime                       |
| `base_url_env`              | String, unset           | Consumer environment variable holding the URL; automatically inherited             |
| `env`                       | String dictionary, `{}` | Explicit runner and child environment values                                       |
| `env_inherit`               | String list, `[]`       | Additional inherited environment names                                             |
| `network_origins`           | String list, `[]`       | Extra HTTP(S) host/port origins available through the browser tunnel               |
| `image`                     | Digest-pinned image     | Defaults to exported `PLAYWRIGHT_IMAGE` from `vrt:defs.bzl`                        |
| `playwright_version`        | String, `"1.63.0"`      | Must match the declared client and browser image                                   |
| `execution_timeout_seconds` | Positive number, `180`  | Deadline per Playwright invocation (separate discovery and capture limits for VRT) |
| `timeout`                   | String, `"long"`        | Independent Bazel test timeout category                                            |
| `tags`                      | String list, `[]`       | Additional tags; required local/manual/uncached tags remain                        |

Choose **exactly one** endpoint source: `server`, the `vite`/`server_config`
pair, `base_url`, or `base_url_env`. Remote URLs preserve paths and queries,
but reject credentials, fragments, and wildcard hosts. Additional
`network_origins` must be origins without paths, credentials, or wildcards.
These restrictions apply to browser traffic; host Node code remains trusted.
Reserve `VRT_*` environment names for the runtime. Docker connection variables
are inherited separately; see [execution boundaries](testcontainers-vrt.md).

Only `component_visual_test` accepts:

| Attribute      | Default             | Contract                                                                          |
| -------------- | ------------------- | --------------------------------------------------------------------------------- |
| `baselines`    | `[]`                | PNG input labels, typically `glob(["__screenshots__/*.png"], allow_empty = True)` |
| `baseline_dir` | `"__screenshots__"` | Package-relative directory exclusively owned by this target; no dot segments      |

An update captures every enabled visual before replacing PNGs and deleting stale
PNGs. Non-PNG files remain. Missing baselines fail comparison. Both comparison
and updates reject CLI filters. E2E/component targets accept only `--grep`,
`--grep-invert`, `--project`, and `--shard` through `--test_arg`.
The implementation's `visual` and `component` switches are not consumer options.

## Playwright configuration

Import helpers and option types from `@rules-web-e2e/vrt`. Each helper returns
`PlaywrightTestConfig`; compose overrides using native `defineConfig`.

| Helper                   | Options                                                        | Discovery                                            |
| ------------------------ | -------------------------------------------------------------- | ---------------------------------------------------- |
| `e2eConfig`              | `BrowserConfigOptions`: absolute `root`, optional `viewport`   | `**/*.spec.ts`, excluding visual and component specs |
| `componentBrowserConfig` | `ComponentBrowserConfigOptions`: above plus required `gallery` | `**/*.browser.spec.{ts,tsx}`                         |
| `visualConfig`           | `VisualConfigOptions`: root, viewport, optional `tolerance`    | Generated `.rules-visual.spec.ts` only               |

`gallery` is relative to the application URL or an absolute URL on the same
origin. It cannot be empty or contain credentials or fragments. For VRT,
resolve the gallery URL in `use.baseURL`; see the [setup guide](getting-started.md).

Shared defaults: Chromium, headless, one worker, no retries, 30-second test
timeout, 1280×720 viewport, en-US, UTC, light theme, and reduced motion.
Failure traces/screenshots and JUnit go to the runner output directory.
Component config additionally blocks service workers.

VRT disables animations, hides the caret, and captures at CSS scale.
Playwright's built-in pixelmatch comparator uses color threshold `0.1`;
`tolerance` is the allowed mismatched pixel ratio, from `0` to `1` (default `0`).
Keep runner-provided `connectOptions`, output paths, discovery, and snapshot
policy when composing config. Overriding them can bypass the execution contract.

## Visual modules and gallery

Import these types and functions from `@rules-web-e2e/vrt/visual`.
A `.visual.tsx` file exports a `ComponentVisualModule<Node>`; the filename is a
convention, not automatic discovery. Import modules explicitly into the gallery.
The generic `Node` is your renderer's node type, for example `ReactNode`.

| Type / field                         | Contract                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `ComponentVisualModule.id`, `.title` | Stable module identity and display name                                                          |
| `.visuals`                           | Readonly array of `ComponentVisual<Node>`                                                        |
| `.renderShell?`                      | `(children: Node) => Node`; wraps each visual with app providers                                 |
| `ComponentVisual.visualId`, `.name`  | Stable case identity and display name                                                            |
| `.render`                            | `(props?: Record<string, unknown>) => Node`; props must be serializable when supplied from specs |
| `.beforeCapture?`                    | Browser-side readiness/setup; may return a promise                                               |
| `.getScreenshotElement?`             | Returns an attached `Element`, optionally asynchronously; defaults to `#root`                    |
| `.vrt?`                              | `false` to exclude from VRT; otherwise `ComponentVisualVrtOptions`                               |

`ComponentVisualVrtOptions` supports `screenshotName`, positive integer
`viewport.width`/`height`, positive integer `deviceScaleFactor`,
`documentLanguage`, and `theme` (`"light"` or `"dark"`). Language sets the
HTML document language; it does not change the browser locale.
Screenshot names are single filenames, optionally ending in `.png`, with no
path separators or `..`. The default is the kebab-cased final segment of
`module.id`, a hyphen, and kebab-cased `visualId`, followed by `.png`.
Duplicate mount IDs and screenshot filenames fail.

`installVisualGallery(modules, {render, unmount})` installs `window.mount`,
`window.unmount`, and `window.rulesVisuals`. Renderer callbacks may be async;
`render` must finish the committed render and surface errors. Preserve the
renderer root for prop updates and release it on unmount. The mount identity
is `${module.id}/${visual.visualId}`. The word `story` in the native browser
protocol is a Playwright field, not a Storybook dependency.

`visualCaptures(modules)` returns `VisualCapture[]` metadata for enabled cases.
`validateCaptures(value)` asserts a nonempty valid catalog and rejects invalid
or duplicate metadata. `VisualCapture` contains `id`, `name`, `screenshotName`,
and the VRT options. `VisualGallery` exposes `captures`,
`mount({story, props})`, `prepareCapture()`, and `unmount()`.
`prepareCapture()` runs the hook, waits for fonts, and marks the capture element.

The runner performs discovery and capture as separate Playwright invocations.
Global setup/teardown must tolerate both phases. Each generated capture gets a
fresh context. See [visual design](visual-testing-design.md) for lifecycle details.

## Custom server types

Import `ServerAdapter`, `ServerContext`, and `RunningServer` from
`@rules-web-e2e/vrt/server`.

```ts
export type ServerAdapter = (
  context: ServerContext
) => RunningServer | Promise<RunningServer>
```

`ServerContext` supplies `root` (staged config directory), `inputs` (entire
staged runfiles tree), `cache` (private cache directory), and `host` (`127.0.0.1`).
Return a ready HTTP `url` on that host with an explicit port and a
`close(): void | Promise<void>` callback. Startup failures must clean up their
own partial resources. See [customization](customization.md) for an adapter example.
