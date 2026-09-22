# API reference

Rules consume built artifacts. Your build owns typechecking, compilation, and
bundling. Start with [preset setup](getting-started.md).

## Test targets

| Load | Rule | Specs |
| --- | --- | --- |
| `@rules_web_e2e//e2e:defs.bzl` | `web_e2e_test` | `*.spec.js`, excluding component/visual specs |
| `@rules_web_e2e//component:defs.bzl` | `component_browser_test` | `*.browser.spec.js` |
| `@rules_web_e2e//vrt:defs.bzl` | `component_visual_test` | Generated from the gallery; rejects `tests` |
| `@rules_web_e2e//vrt:defs.bzl` | `visual_test` | Compiled specs with native `toHaveScreenshot` assertions |

### Common attributes

| Attribute | Default | Contract |
| --- | --- | --- |
| `name` | Required | Target name |
| `tests` | Required except gallery VRT | Compiled ESM specs and dependencies; source JavaScript is rejected |
| `browser` | Unset | Linux runtime; required for VRT, selects isolated execution for interaction tests |
| `playwright` | Pinned 1.63.0 | `playwright_runtime` target |
| `server` | Unset | Compiled default `ServerAdapter` export |
| `shell` | Unset | `browser_shell` target |
| `base_url` / `base_url_env` | Unset | Existing HTTP(S) URL or its environment-variable name |
| `config` | Generated | Compiled ESM Playwright config |
| `data` | `[]` | Additional runtime inputs |
| `env` / `env_inherit` | `{}` / `[]` | Explicit values / inherited names; inheritance is host-only |
| `network_origins` / `network_origins_env` | `[]` / `[]` | Extra allowed origins / env names containing them; host-only |
| `args` | `[]` | Default selection flags; see below |
| `target_arch` | `"x64"` | `"x64"` or `"arm64"`; ARM64 currently supports VRT only |
| `target_platform` | Linux platform for `target_arch` | Override for native ABI constraints; must match the runtime |
| `execution_timeout_seconds` | `180` | Per Playwright invocation; discovery and capture have separate deadlines |
| `timeout` | `"long"` | Independent Bazel test timeout |
| `tags` | `[]` | Additional tags; browser targets are manual |

Choose one of `server`, `shell`, `base_url`, or `base_url_env`. Alternatively,
use a config-only target with `use.baseURL` and optional `webServer`.
For isolated tests, URLs must be action-local and environment values explicit.

Spec producers must include typechecking, module markers, imports, and generated
files in their build graph. The rules request available `transitive_typecheck`
outputs; shell producers must depend on their own typecheck action.

E2E/component tests accept `--grep`, `--grep-invert`, `--project`, `--shard`,
declared spec paths, and `--pass-with-no-tests` in `args` or `--test_arg`.
Source `.spec.ts`/`.spec.tsx` paths map to emitted `.spec.js`.
Visual targets reject these filters and runtime arguments; use separate targets
and baseline directories for different suites.

### Visual attributes

| Attribute | Default | Contract |
| --- | --- | --- |
| `matching` | Zero mismatched pixels | Numeric-string dictionary or compiled `VisualMatching` module |
| `baselines` | `[]` | Existing PNG labels |
| `baseline_dir` | `"__screenshots__"` | Package-relative directory owned by this target |

`<name>.update` runs the full visual suite, replaces PNGs, and removes stale PNGs
only after a successful, nonempty capture. Other files remain. Comparison fails
on missing baselines. Review updates before committing.

All targets reserve `<name>_sources` and `<name>_inputs`. `visual` and `component`
are private mode switches.

## Built shells

Load `browser_shell` from `@rules_web_e2e//component:defs.bzl`:

```starlark
browser_shell(name = "gallery", assets = ":built_gallery", entry_point = "gallery.html")
```

`assets` is one built directory. `entry_point` defaults to `index.html` and must
be relative HTML inside it; it is served at `/`. Component tests and gallery VRT
require that page to install the gallery registry. Asset URLs resolve within the
served directory. The server rejects traversal and links outside that directory.

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

Set `playwright = ":playwright"` on tests. Stable versions >=1.63.0 are accepted;
1.63.0 is the tested preset version. Client packages, spec imports, and Chromium
must match. The runner validates versions before execution.

## VRT matching

```starlark
matching = {"threshold": "0.1", "maxDiffPixelRatio": "0.01"}
```

Dictionary values are JSON numeric strings because Starlark has no floats.
Alternatively, pass a compiled ESM module exporting `VisualMatching` from
`@rules-web-e2e/vrt`, with its module marker and runtime dependencies.

| Field | Default | Valid values |
| --- | --- | --- |
| `threshold` | `0.1` | Per-pixel color tolerance, 0–1 |
| `maxDiffPixels` | Unset | Nonnegative integer |
| `maxDiffPixelRatio` | `0` when no count is set | Mismatched fraction, 0–1 |

Choose count or ratio, not both. Unknown, malformed, or nonfinite values fail
before capture. Rendering settings and readiness hooks belong in visual modules.

## Optional Playwright configuration

Supply compiled `.js`/`.mjs` exporting `PlaywrightTestConfig`. Most shell/adapter
targets need no config. Supported customization includes fixtures, setup/teardown,
timeouts, reporters, E2E projects, and config-only `use.baseURL`/`webServer`.

- Declare server executables, assets, and setup/report modules as inputs. Relative
  paths resolve against the compiled config. Existing servers are never reused.
- Keep top-level evaluation declarative: config inspection happens in a separate
  process. VRT discovery and capture each run setup, teardown, and reporters.
- Projects must share an origin; extra origins need the host network allowlist.
  Visual targets reject projects. Isolated actions have no external networking.
- `testMatch`, `testIgnore`, and `testDir` are rejected: Bazel owns suite selection.
- The runner owns browser connection, discovery, output paths, list/JUnit reports,
  and snapshot policy. CLI config/reporter/output overrides are rejected.

Defaults: headless Chromium, one worker, no retries, 30-second tests, 1280×720,
en-US, UTC, light theme, reduced motion. Component tests block service workers.
VRT disables animations, hides the caret, and uses CSS-scale screenshots;
`expect.toHaveScreenshot.scale = 'device'` opts into device pixels.

Custom reporters use Playwright's `reporter` field alongside required reports.
Write files under `VRT_OUTPUTS`, avoiding `junit.xml` and `artifacts`. Declare
reporter modules and credentials. Upload isolated-action reports afterward in CI.

`e2eConfig`, `componentBrowserConfig`, and `visualConfig` remain exported from
`@rules-web-e2e/vrt`; they require runner environment and are not needed at normal
call sites. See [E2E configuration](e2e.md) and [custom servers](customization.md).

## Visual modules and gallery

Import from `@rules-web-e2e/vrt/visual`. Explicitly register each
`ComponentVisualModule<Node>`; `.visual.tsx` naming does not discover modules.
`Node` is the renderer's type, such as `ReactNode`.

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
`deviceScaleFactor`, `documentLanguage`, and `theme` (`'light'`/`'dark'`).
Viewport capture skips element selection. Language changes HTML language, not locale.

Screenshot names are single filenames, optionally ending in `.png`, without
separators or `..`. The default is the kebab-cased final module-ID segment plus
`-` and kebab-cased visual ID. Duplicate IDs or filenames fail.

`installVisualGallery(modules, {render, unmount})` installs `window.mount`,
`window.unmount`, and `window.rulesVisuals`. Async render callbacks must complete
the committed render and surface errors. Preserve roots for prop updates; release
them on unmount. Mount IDs are `${module.id}/${visual.visualId}`.

`visualCaptures(modules)` returns enabled `VisualCapture[]` metadata;
`validateCaptures(value)` checks a nonempty, valid, unique catalog.
`VisualGallery` exposes `captures`, `mount({story, props})`, `prepareCapture()`,
and `unmount()`. Preparation runs the hook, waits for fonts, and marks the element.
Each generated capture gets a fresh context. See [gallery examples](component-browser.md).

## Custom server types

Import `ServerAdapter`, `ServerContext`, `RunningServer`, and `serveDirectory`
from `@rules-web-e2e/vrt/server`.

```ts
export type ServerAdapter = (
  context: ServerContext
) => RunningServer | Promise<RunningServer>
```

A compiled adapter exports this function as default. Context fields: `root`
(staged target package), `inputs` (staged runfiles), `cache` (private directory),
and `host` (`127.0.0.1`). Return a ready HTTP `url` with an explicit port and
`close(): void | Promise<void>`. Clean up partial resources on startup failure.

`serveDirectory(directory, entryPoint = 'index.html')` returns
`Promise<RunningServer>`. See [customization](customization.md).

## VRT execution

Use the [worker preset](worker-preset.md) or [manual worker setup](actiond.md).
VRT capture/comparison are cacheable build actions; local wrappers report results
and apply updates. Native isolated E2E/component tests use Bazel test caching and
retry semantics. Host tests remain local/manual/uncached.

### Runtime convenience rules

| API | Purpose |
| --- | --- |
| `browser_presets.linux_amd64(name, release)` in `playwright:extensions.bzl` | Versioned complete runtime, exposed as `@name//:browser` |
| `linux_chromium_runtime(name, chromium, node, arch?, system?, fonts?)` in `playwright:browser.bzl` | Custom binaries with pinned Linux libraries/fonts; `arch` defaults to `"x64"` |
| `browser_runtime(...)` in `playwright:defs.bzl` | Declare executable/loader paths in a custom runtime tree |
| `browser_runtime_archive(archive=...)` or `(archives=..., paths=..., files=...)` in `playwright:archive.bzl` | Assemble declared archives/files without package installation |
| `playwright_browser_installation(name, chromium, ffmpeg, playwright?)` in `playwright:browser.bzl` | Host browser cache for Linux x64 or macOS x64/arm64 |

See [runtime attributes and examples](browser-runtime.md), [host provisioning](host-browsers.md),
and [ARM64 VRT](macos-arm64-vrt.md).
