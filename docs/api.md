# API reference

Rules consume built artifacts. Your build owns typechecking, compilation, and
bundling. Start with [preset setup](getting-started.md).

Browser runfiles include each input target's default files and declared runfiles
with runtime-only filtering enabled by default for compiled inputs,
not its `transitive_typecheck` output group. Keep semantic typechecking in separate
validation targets; executing browser test does not replace that validation.

Runner removes private scratch state on success and failure while retaining
failure artifacts outside that directory. Forwarded child-process console output
filters common Cookie and Authorization header lines, including lines split across
stream chunks. This not general secret scrubbing: traces, reports, screenshots,
and application-specific output can still contain sensitive data.

## Test targets

| Load | Rule | Specs |
| --- | --- | --- |
| `@rules_web_e2e//e2e:defs.bzl` | `web_e2e_test` | `*.spec.js`, excluding component/visual specs |
| `@rules_web_e2e//e2e:defs.bzl` | `browser_process_test` | `*.spec.js`; caller launches its own process, no managed browser or URL |
| `@rules_web_e2e//component:defs.bzl` | `component_browser_test` | `*.browser.spec.js` |
| `@rules_web_e2e//vrt:defs.bzl` | `component_visual_test` | Generated from gallery; rejects `tests` |
| `@rules_web_e2e//vrt:defs.bzl` | `visual_test` | Compiled specs with native `toHaveScreenshot` assertions |

### Common attributes

| Attribute | Default | Contract |
| --- | --- | --- |
| `name` | Required | Target name |
| `tests` | Required except gallery VRT | Compiled ESM specs and dependencies; source JavaScript rejected |
| `browser` | Unset | Linux runtime; required for VRT, selects isolated execution for interaction tests |
| `exec_properties` | `{}` | Optional local execution properties; included in action inputs |
| `execution` | `"actiond"` | `"local"` runs declared browsers in Linux namespaces; see [local execution](local-linux.md) |
| `playwright` | Pinned 1.63.0 | `playwright_runtime` target |
| `server` | Unset | Compiled default `ServerAdapter` export |
| `shell` | Unset | `browser_shell` target |
| `base_url` / `base_url_env` | Unset | Existing HTTP(S) URL or its environment-variable name |
| `config` | Generated | Compiled ESM Playwright config |
| `data` | `[]` | Additional runtime inputs |
| `runtime_only` | `True` | Exclude source/type/debug files from compiled inputs in the test target's repository; explicit `data` stays unfiltered. Set `False` to retain source/debug inputs. See [runtime-only inputs](e2e.md#runtime-only-inputs). |
| `env` / `env_inherit` | `{}` / `[]` | Explicit values / inherited names; inheritance host-only |
| `network_origins` / `network_origins_env` | `[]` / `[]` | Extra allowed origins / env names containing them; host-only |
| `args` | `[]` | Default selection flags; see below |
| `target_arch` | `"x64"` | `"x64"` or `"arm64"`; actiond ARM64 supports VRT only; local ARM64 supports all declared-browser suites |
| `target_platform` | Linux platform for `target_arch` | Override for native ABI constraints; must match runtime |
| `execution_timeout_seconds` | `180` | Per Playwright invocation; discovery and capture have separate deadlines |
| `timeout` | `"long"` | Independent Bazel test timeout |
| `snapshot_dir` | None | Host E2E/component/process snapshot directory, relative to package. Enables `.update`; owns snapshot layout. |
| `snapshots` | `[]` | Declared baseline files for `snapshot_dir`, usually `glob(["snapshots/**"], allow_empty = True)`. |
| `cacheable` | `False` | For `execution = "local"`, opt into normal Bazel disk/remote result caching; see [local caching](local-linux.md#caching-and-lifecycle). For host E2E/component tests, requires explicit browser path and caller-declared inputs. Host opt-in forbids URL attributes, env inheritance, visual, process-owned, or isolated browser modes. See [caching contract](e2e.md#opt-in-local-result-caching). |
| `tags` | `[]` | Additional tags; browser targets manual |

Choose one of `server`, `shell`, `base_url`, or `base_url_env`. Alternatively,
use config-only target with `use.baseURL` and optional `webServer`.
For isolated tests, URLs must be action-local and environment values explicit.
`browser_process_test` needs none of these URL/server options; its compiled
`config` optional, and specs select their own declared executable inputs.

Spec producers must include module markers, imports, and generated files in
their build graph. Keep semantic typechecking in separate validation targets;
browser tests do not request `transitive_typecheck` outputs.

E2E/component tests accept `--grep`, `--grep-invert`, `--project`, `--shard`,
declared spec paths, and `--pass-with-no-tests` in `args` or `--test_arg`.
`--export-snapshots` captures replacement images under test outputs with runfiles-path manifest; it never updates checked-in files. See [snapshot export](e2e.md).
Source `.spec.ts`/`.spec.tsx` paths map to emitted `.spec.js`.
Visual targets reject these filters and runtime arguments; use separate targets
and baseline directories for different suites.

### Visual attributes

| Attribute | Default | Contract |
| --- | --- | --- |
| `matching` | Zero mismatched pixels | Numeric-string dictionary or compiled `VisualMatching` module |
| `baselines` | `[]` | Existing PNG labels |
| `baseline_dir` | `"__screenshots__"` | Package-relative directory owned by this target |
| `host_vrt` | `False` | Opt in to Linux amd64 host execution of capture and comparison; requires declared browser runtime |

`<name>.update` runs full visual suite, replaces PNGs, and removes stale PNGs
only after successful, nonempty capture. Other files remain. Comparison fails
on missing baselines. Review updates before committing.

`host_vrt` runs VRT in Bazel's local sandbox and does not start actiond.
Comparison native Bazel test: use `--nocache_test_results` to rerun it on
unchanged inputs. Baseline capture remains build action and Bazel may reuse
locally completed capture on identical `.update` invocation. Host's
libc, shell, kernel, and system services become execution inputs; use
controlled CI image and recapture baselines before switching from worker.
Host VRT does not use remote execution or remote action cache.

All targets reserve `<name>_sources` and `<name>_inputs`. `visual` and `component`
 private mode switches.

## Built shells

Load `browser_shell` from `@rules_web_e2e//component:defs.bzl`:

```starlark
browser_shell(name = "gallery", assets = ":built_gallery", entry_point = "gallery.html")
```

`assets` one built directory. Only that directory reaches the browser;
compiler inputs stay out of runtime runfiles. `entry_point` defaults to `index.html` and must
be relative HTML inside it; it served at `/`. Component tests and gallery VRT
require that page to install gallery registry. Asset URLs resolve within
served directory. Server rejects traversal and links outside that directory.

## Playwright runtime

Load `playwright_runtime` from `@rules_web_e2e//playwright:defs.bzl`:

```starlark
playwright_runtime(
    name = "playwright",
    test = "//:node_modules/@playwright/test/dir",
    core = "//:node_modules/playwright-core/dir",
    version = "1.63.0",
)
```

Set `playwright = ":playwright"` on tests. Stable versions >=1.63.0 accepted;
1.63.0 tested preset version. Client packages, spec imports, and Chromium
must match. Bazel checks declared package versions at build time. Runner checks
declared package identity and Chromium before tests.

## VRT matching

```starlark
matching = {"threshold": "0.1", "maxDiffPixelRatio": "0.01"}
```

Dictionary values JSON numeric strings because Starlark has no floats.
Alternatively, pass compiled ESM module exporting `VisualMatching` from
`@rules-web-e2e/vrt`, with its module marker and runtime dependencies.

| Field | Default | Valid values |
| --- | --- | --- |
| `threshold` | `0.1` | Per-pixel color tolerance, 0–1 |
| `maxDiffPixels` | Unset | Nonnegative integer |
| `maxDiffPixelRatio` | `0` when no count set | Mismatched fraction, 0–1 |

Choose count or ratio, not both. Unknown, malformed, or nonfinite values fail
before capture. Rendering settings and readiness hooks belong in visual modules.

## Optional Playwright configuration

Supply compiled `.js`/`.mjs` exporting `PlaywrightTestConfig`. Most shell/adapter
targets need no config. Supported customization includes fixtures, setup/teardown,
timeouts, reporters, E2E projects, and config-only `use.baseURL`/`webServer`.

- Declare server executables, assets, and setup/report modules as inputs. Relative
  paths resolve against compiled config. Existing servers never reused.
- Keep top-level evaluation declarative: config inspection happens in separate
  process. VRT discovery and capture each run setup, teardown, and reporters.
- Projects must share origin; extra origins need host network allowlist.
  Visual targets reject projects. Isolated actions have no external networking.
- `testMatch`, `testIgnore`, and `testDir` rejected: Bazel owns suite selection.
- Runner owns browser connection, discovery, output paths, list/JUnit reports,
  and snapshot policy. CLI config/reporter/output overrides rejected.

Defaults: headless Chromium, one worker, no retries, 30-second tests, 1280×720,
en-US, UTC, light theme, reduced motion. Component tests block service workers.
VRT disables animations, hides caret, and uses CSS-scale screenshots;
`expect.toHaveScreenshot.scale = 'device'` opts into device pixels.

Custom reporters use Playwright's `reporter` field alongside required reports.
Write files under `VRT_OUTPUTS`, avoiding `junit.xml` and `artifacts`. Declare
reporter modules and credentials. Upload isolated-action reports afterward in CI.

`e2eConfig`, `componentBrowserConfig`, and `visualConfig` remain exported from
`@rules-web-e2e/vrt`; they require runner environment and not needed at normal
call sites. See [E2E configuration](e2e.md) and [custom servers](customization.md).

## Visual modules and gallery

Import from `@rules-web-e2e/vrt/visual`. Explicitly register each
`ComponentVisualModule<Node>`; `.visual.tsx` naming does not discover modules.
`Node` renderer's type, such as `ReactNode`.

| Member | Contract |
| --- | --- |
| Module `id`, `title`, `visuals` | Stable identity, display name, readonly case list |
| Module `renderShell?` | `(children: Node) => Node`; app providers |
| Case `visualId`, `name` | Stable case identity and display name |
| Case `render` | `(props?: Record<string, unknown>) => Node`; serializable spec props |
| Case `beforeCapture?` | Async-capable browser setup/readiness hook |
| Case `getScreenshotElement?` | Attached `Element` or promise; defaults to `#root` |
| Case `vrt?` | `false` to exclude, otherwise options below |

`ComponentVisualVrtOptions`: `capture` (`'element'` default or `'viewport'`),
`screenshotName`, positive integer `viewport.width`/`height` and
`deviceScaleFactor`, `documentLanguage`, `theme` (`'light'`/`'dark'`), and
`hoverSelector` (CSS selector for real Playwright hover after mount and before
`beforeCapture`).
Viewport capture skips element selection. Language changes HTML language, not locale.

Screenshot names single filenames, optionally ending in `.png`, without
separators or `..`. Default kebab-cased final module-ID segment plus
`-` and kebab-cased visual ID. Duplicate IDs or filenames fail.

`installVisualGallery(modules, {render, unmount})` installs `window.mount`,
`window.unmount`, and `window.rulesVisuals`. Async render callbacks must complete
committed render and surface errors. Preserve roots for prop updates; release
them on unmount. Mount IDs `${module.id}/${visual.visualId}`.

`visualCaptures(modules)` returns enabled `VisualCapture[]` metadata;
`validateCaptures(value)` checks nonempty, valid, unique catalog.
`VisualGallery` exposes `captures`, `mount({story, props})`, `prepareCapture()`,
and `unmount()`. Preparation runs hook, waits for fonts, and marks element.
Each generated capture gets fresh context. See [gallery examples](component-browser.md).

## Custom server types

Import `ServerAdapter`, `ServerContext`, `RunningServer`, and `serveDirectory`
from `@rules-web-e2e/vrt/server`.

```ts
export type ServerAdapter = (
  context: ServerContext
) => RunningServer | Promise<RunningServer>
```

Compiled adapter exports this function as default. Context fields: `root`
(staged target package), `inputs` (staged runfiles), `cache` (private directory),
and `host` (`127.0.0.1`). Return ready HTTP `url` with explicit port and
`close(): void | Promise<void>`. Clean up partial resources on startup failure.

`serveDirectory(directory, entryPoint = 'index.html')` returns
`Promise<RunningServer>`. See [customization](customization.md).

## VRT execution

Use [worker preset](worker-preset.md) or [manual worker setup](actiond.md).
Linux amd64 and ARM64 VRT comparisons use native Bazel test caching, retries,
repeated runs, and timeouts. Isolated amd64 E2E/component tests use same path.
VRT capture remains build action with local update command.
Host E2E/component tests default to local, manual,
uncached execution; see `cacheable` for explicit opt-in.

### Runtime convenience rules

| API | Purpose |
| --- | --- |
| `browser_presets.linux_amd64(name, release)` in `playwright:extensions.bzl` | Versioned complete runtime, exposed as `@name//:browser` |
| `linux_chromium_runtime(name, chromium, node, arch?, system?, fonts?, ffmpeg?, chromium_path?, ffmpeg_path?)` in `playwright:browser.bzl` | Custom binaries with pinned Linux libraries/fonts and optional video helper; `arch` defaults to `"x64"` |
| `browser_runtime(...)` in `playwright:defs.bzl` | Declare executable/loader paths in custom runtime tree |
| `browser_runtime_archive(archive=...)` or `(archives=..., paths=..., files=...)` in `playwright:archive.bzl` | Assemble declared archives/files without package installation |
| `playwright_browser_installation(name, chromium, ffmpeg, playwright?, chromium_path?, ffmpeg_path?)` in `playwright:browser.bzl` | Host browser cache for Linux x64 or macOS x64/arm64 |

See [runtime attributes and examples](browser-runtime.md), [host provisioning](host-browsers.md),
and [ARM64 VRT](macos-arm64-vrt.md).
