# API reference

Rules consume built artifacts. Consumers own compilation, bundling, typechecks,
fixtures, and baseline review. Browser targets use default files and runfiles;
they do not request `transitive_typecheck`. See [setup](getting-started.md).

## Test targets

| Load | Rule | Input and behavior |
| --- | --- | --- |
| `@rules_web_e2e//e2e:defs.bzl` | `web_e2e_test` | Compiled `*.spec.js`, excluding `*.browser.spec.js` and `*.visual.spec.js`; managed server or existing URL |
| `@rules_web_e2e//e2e:defs.bzl` | `browser_process_test` | Compiled `*.spec.js`; specs launch their own Electron/browser process |
| `@rules_web_e2e//component:defs.bzl` | `component_browser_test` | Compiled `*.browser.spec.js`; native mounts through a gallery |
| `@rules_web_e2e//vrt:defs.bzl` | `visual_test` | Compiled `*.spec.js` with native `toHaveScreenshot` assertions |
| `@rules_web_e2e//vrt:defs.bzl` | `component_visual_test` | Generated captures from gallery visual modules; rejects `tests` |

### Execution modes

| Selection | Platform | Network and prerequisites |
| --- | --- | --- |
| Omit `browser` | Host E2E/component/process tests | Host network and caller-provisioned executables; caller controls sandbox and remote execution tags |
| `browser`, default `execution = "actiond"` | Linux amd64; ARM64 VRT | Worker VM, declared runtime, loopback-only fixtures |
| `browser`, `execution = "local"` | Linux x64/ARM64 | Declared runtime in user/mount/PID/network namespaces; no KVM; Chromium sandbox enabled |
| `browser`, `host_vrt = True` | Linux amd64 VRT | Host libc, Bash, kernel, and networking; controlled host environment required |

Process-owned tests reject `browser`, managed server/shell/URL options, and
`host_vrt`. Host managed tests also reject `connectOptions`; process-owned
specs select their own native launch settings. Local execution requires `browser` and cannot combine with `host_vrt`.
VRT always requires `browser`. See [worker setup](worker-preset.md),
[local Linux](local-linux.md), and [host browsers](host-browsers.md).

### Common attributes

| Attribute | Default | Contract |
| --- | --- | --- |
| `name` | Required | Target name |
| `tests` | Required except gallery VRT | Compiled ESM specs and dependencies; source JavaScript rejected |
| `server` | `None` | One compiled default `ServerAdapter` module |
| `shell` | `None` | Built `browser_shell` target |
| `base_url` | `None` | Existing HTTP(S) URL; caller owns readiness and lifetime |
| `base_url_env` | `None` | URL variable; automatically inherited on host, explicitly set in `env` with `browser` |
| `config` | Generated defaults | One compiled `.js`/`.mjs` Playwright config |
| `playwright` | Rules' pinned 1.63.0 | `playwright_runtime` using the same packages as specs/config |
| `browser` | `None` | `BrowserRuntimeInfo` target; selects declared Linux execution |
| `execution` | `"actiond"` | `"actiond"` or `"local"` |
| `target_arch` | `"x64"` | `"x64"` or `"arm64"`; actiond ARM64 supports VRT, local ARM64 supports all declared-browser suites |
| `target_platform` | Linux platform for `target_arch` | Fixture/input platform; must match runtime OS/CPU and native ABI |
| `worker_sha256` | Preset digest on actiond x64 | Custom worker binary lowercase 64-digit SHA256; actiond ARM64 defaults empty; scopes identity to browser actions |
| `exec_properties` | `{}` | Supported only with `execution = "local"`; included in job inputs |
| `data` | `[]` | Additional runtime files, executables, and assets |
| `runtime_only` | `True` | Filter source/type/debug inputs and repository-owned directory maps; npm packages and explicit `data` remain unfiltered |
| `env` / `env_inherit` | `{}` / `[]` | Explicit values / inherited names; inheritance unsupported with `browser` |
| `args` | `[]` | Default allowed selection flags; see selection below |
| `tags` | `[]` | Caller test selection, cache, and execution policy; no automatic `manual` tag |
| `timeout` | `"long"` | Bazel test timeout; does not bound capture build actions |
| `shard_count` | `0` | Bazel test shards mapped to Playwright shards |
| `execution_timeout_seconds` | `180` | Capture/standalone invocation deadline; native tests use Bazel's deadline |
| `network_origins` / `network_origins_env` | `[]` / `[]` | Legacy attributes; nonempty values rejected in every mode |

Choose one of `server`, `shell`, `base_url`, or `base_url_env`, or use config-only
`use.baseURL` with optional `webServer`. Process-owned tests need none of these;
their config is optional. Declare imports, package markers, executable permissions,
and fixture dependencies. `$(rootpath ...)` expands in explicit environment
values, including JSON. `VRT_*` environment names are reserved.

Host tests use normal Bazel caching and caller execution constraints. Add
`manual` for separate lanes, `external` for tests that must run every time,
`no-remote-exec` for host-only execution, and cache tags when reuse is unsafe.
See [runtime-only inputs](e2e.md#runtime-only-inputs) and
[result caching](e2e.md#result-caching).

### Selection and snapshots

E2E/component/process tests accept `--grep`, `--grep-invert`, `--project`,
`--shard`, declared spec paths, and `--pass-with-no-tests` through `args` or
`--test_arg`. Source `.spec.ts`/`.spec.tsx` selectors map to compiled `.spec.js`.
Bazel's `--test_filter` maps to grep; `shard_count` maps to Playwright sharding.
Do not combine Bazel filtering/sharding with corresponding Playwright flags.

VRT rejects selector flags in `args` and runtime CLI arguments. Native comparison
still supports Bazel filtering/sharding; `.update` captures the full target.

Host E2E/component/process targets also accept:

| Attribute | Default | Contract |
| --- | --- | --- |
| `snapshot_dir` | `None` | Package-relative owned snapshot directory; enables `<name>.update` |
| `snapshots` | `[]` | Declared baseline files; requires `snapshot_dir` |

`--export-snapshots` writes captures and `snapshot-sources.json` beneath test
outputs without editing sources; `snapshot_dir` is optional for export.
`.update` uses a guarded Bazel source writer. `--@rules_web_e2e//:snapshot_filter`
selects captures while preserving unselected declared snapshots;
`--@rules_web_e2e//:snapshot_refresh` forces capture after environmental changes.
Declare the entire snapshot tree. Updates/export reject Bazel filtering/sharding;
VRT rejects snapshot export and uses `baseline_dir` instead.
See [snapshot updates](e2e.md#snapshot-updates).

### Visual attributes

| Attribute | Default | Contract |
| --- | --- | --- |
| `matching` | Threshold 0.1, zero mismatched pixels | Numeric-string dictionary or compiled `VisualMatching` module |
| `baselines` | `[]` | Declared PNG labels |
| `baseline_dir` | `"__screenshots__"` | Package-relative directory owned by this target |
| `capture_manifest` | `None` | Gallery VRT only: declared JSON `VisualCapture[]` catalog; skips browser discovery |
| `host_vrt` | `False` | Linux amd64 host capture/comparison; incompatible with `execution = "local"` |

Native comparisons use Bazel retries, repeated runs, caching, and timeouts.
Capture is a build action; `.update` applies successful, nonempty captures and
removes stale PNGs. The owned VRT directory must contain only regular PNGs.
Failed/empty captures, concurrent updates, and edits during capture are rejected.
Move README files and other content outside that directory. Source updates
require a target in the invoking workspace. Host VRT uses local execution/cache;
capture actions may reuse unchanged inputs on repeated `.update` runs.

A declared catalog is validated against the loaded gallery before capture.
Without `capture_manifest`, gallery discovery and capture are separate invocations;
setup/teardown and reporters must tolerate both. See
[gallery captures](component-vrt.md#build-the-capture-catalog).

Reserve `<name>_sources`, `<name>_inputs`, generated capture/matching/snapshot
helper names, and `<name>.update`. `visual`, `component`, and `process_owned`
are private mode switches.

## Aggregate Playwright UI

Load `web_e2e_ui` from `@rules_web_e2e//e2e:defs.bzl`:

```starlark
web_e2e_ui(
    name = "e2e_ui",
    suites = [":e2e_tests"],
    config = ":compiled_ui_config",
)
```

| Attribute | Default | Contract |
| --- | --- | --- |
| `name` | Required | Developer executable target |
| `suites` | Required | `web_e2e_test` targets or recursively nested explicit `test_suite.tests` |
| `config` | Required | One compiled aggregate Playwright config |
| `playwright` | Rules' pinned runtime | Same test/core packages as specs/config |
| `data` / `env` | `[]` / `{}` | Aggregate server dependencies and environment; invoking environment also inherited |
| `args` | `[]` | Default Playwright UI arguments |
| `visibility` | `None` | Executable target visibility |

`bazel run //:e2e_ui` runs the declared CLI over deduplicated compiled specs.
Per-suite configs/environment and `test_suite` tag filtering are not combined.
Component, visual, and process-owned suites are rejected. Rebuild/relaunch after
source edits. Reserve `<name>_ui_inputs`; `ui_bundle` exposes the built bundle.
No test caching, CI deadline, or worker supervision. See [UI guide](ui.md).

## Built shells

Load `browser_shell` from `@rules_web_e2e//component:defs.bzl`.

| Attribute | Default | Contract |
| --- | --- | --- |
| `name` | Required | Shell target |
| `assets` | Required | Single built HTML/JS/CSS directory; producer runfiles are not forwarded |
| `entry_point` | `"index.html"` | Relative HTML without dot segments; served at `/` |

Component/gallery targets require the page to install the gallery registry.
The static server does no compilation. Missing files return 404; traversal is
rejected. Isolated serving rejects links outside the asset directory; host
serving permits declared Bazel sandbox links.

## Runtime rules and presets

### Playwright runtime

Load `playwright_runtime` from `@rules_web_e2e//playwright:defs.bzl`.

| Attribute | Default | Contract |
| --- | --- | --- |
| `name` | Required | Runtime target |
| `test` / `core` | Required | Single package directories for `@playwright/test` / `playwright-core` |
| `version` | `"1.63.0"` | Stable `major.minor.patch` >=1.63.0 |

Bazel checks package versions at build time; execution checks package identity
and Chromium. Consumer imports must resolve the selected package graph.

### Browser presets

Use `browser_presets` from `@rules_web_e2e//playwright:extensions.bzl` in
`MODULE.bazel`, then `linux_amd64(name, release)` and `use_repo`.
Release `"20260921"` supplies a complete pinned runtime as `@name//:browser`
and its manifest as `@name//:manifest.json`. Name/release are required;
unknown releases and duplicate repository names fail.
See [preset setup](browser-runtime.md#basic-versioned-preset).

### Linux Chromium assembly

Load `linux_chromium_runtime` from `@rules_web_e2e//playwright:browser.bzl`.

| Attribute | Default | Contract |
| --- | --- | --- |
| `name` | Required | Runtime target and assembled directory |
| `chromium` / `node` | Required | Headless-shell files/directory and matching Linux Node ELF |
| `arch` | `"x64"` | `"x64"` or `"arm64"` |
| `system` | Matching Noble `20260901` preset | Declared library/shell/font directory; excludes Chromium and Node |
| `fonts` | `[]` | Additional declared font files/directories |
| `ffmpeg` | Unset | Pinned helper for video recording |
| `chromium_path` | `"chrome-headless-shell"` | Executable path/suffix in input; parent is bundle root |
| `ffmpeg_path` | `"ffmpeg-linux"` | Executable path/suffix in FFmpeg input |

Paths must be relative without dot segments. Assembly checks binary architecture;
execution checks Chromium against Playwright metadata. See [custom assembly](browser-runtime.md).

### Custom runtime descriptor

Load `browser_runtime` from `@rules_web_e2e//playwright:defs.bzl`.

| Attribute | Default | Contract |
| --- | --- | --- |
| `name` / `root` | Required | Target name / single declared Linux runtime directory |
| `executable` / `node` | Required | Chromium / Node paths within root |
| `library_dirs` / `fontconfig` | Required | Library directory list / fontconfig directory within root |
| `arch` | `"x64"` | `"x64"` or `"arm64"` |
| `ffmpeg` | `""` | Optional helper path within root |
| `loader` | `"lib/ld-linux-x86-64.so.2"` | Loader path; local execution requires architecture-matched loader |
| `bash` | `"bin/bash"` | Bash path; local execution uses declared shell |

Descriptor paths must be relative without dot segments. Actiond supplies its
own loader/libc/Bash; local execution uses the declared runtime layout.
`BrowserRuntimeInfo` exposes `descriptor` and `root_file`; `PlaywrightInfo`
exposes `test`, `core`, `core_file`, and `version` for custom rules.

### Archive assembly

Load `browser_runtime_archive` from `@rules_web_e2e//playwright:archive.bzl`.

| Attribute | Default | Contract |
| --- | --- | --- |
| `name` | Required | Output directory target |
| `archive` / `archives` | Unset / `[]` | Filesystem tar(s); require at least one; extracted in order |
| `paths` | `{}` | Archive source paths to output paths; empty selects all |
| `exclude` | `[]` | Archive-relative files/directories omitted before selection |
| `files` | `{}` | Label-to-destination map; each label supplies one file/directory |

Bazel's tar toolchain normalizes compression; declared tools validate paths and
materialize links within the combined archive root. Missing/excluded link targets,
overlapping destinations, and added-file overwrites fail. No package installation
or dependency discovery. See [runtime layouts](browser-runtime.md#advanced-custom-runtime-layout).

### Host browser cache

Load `playwright_browser_installation` from `@rules_web_e2e//playwright:browser.bzl`.

| Attribute | Default | Contract |
| --- | --- | --- |
| `name` | Required | Browser cache directory target |
| `chromium` / `ffmpeg` | Required | Caller-owned headless-shell and FFmpeg inputs |
| `playwright` | Rules' pinned runtime | Package metadata supplies cache revisions |
| `chromium_path` | `"chrome-headless-shell"` | Executable path/suffix in Chromium input |
| `ffmpeg_path` | Platform helper name | `ffmpeg-linux` or `ffmpeg-mac`; override for nested input |

Supports Linux x64 and macOS x64/ARM64. Pass it in test `data` and set
`PLAYWRIGHT_BROWSERS_PATH` to its runfiles path. Tests never download browsers.

### Worker launcher

`@rules_web_e2e//worker:runner` materializes the pinned Linux amd64 supervisor.
Operations: `doctor`, `build`, `test`, `run`, and `exec`; options control Bazel, port,
resources, startup timeout, and logs. Run the generated script outside `bazel run`
to avoid its lock. `@rules_web_e2e//worker:supervisor` exports
`preflight(worker, expectedDigest)`, `bazelConfig(endpoint)`, and
`supervise(worker, command, logDir, port?, startupTimeout?, memoryMib?, casImageSizeMib?)`.
See [launcher commands](worker-preset.md).

## TypeScript exports

### Configuration helpers

Import from `@rules-web-e2e/vrt`:

| Export | Contract |
| --- | --- |
| `BrowserConfigOptions` | `root`; optional `viewport` |
| `ComponentBrowserConfigOptions` | Browser options plus same-origin `gallery` |
| `VisualConfigOptions` | Browser options plus optional `tolerance` ratio, default 0 |
| `processConfig(options)` | Reports/selection defaults; no managed browser or URL |
| `e2eConfig(options)` | Managed Chromium defaults |
| `componentBrowserConfig(options)` | Native mounts; service workers blocked by default |
| `visualConfig(options)` | Screenshot and baseline defaults |
| `VisualMatching` | `threshold`, `maxDiffPixels`, or `maxDiffPixelRatio` |

### VRT matching

Helpers require runner environment; ordinary targets do not call them directly.
`matching` accepts a compiled default `VisualMatching` export or numeric-string
Starlark dictionary, e.g. `{"threshold": "0.1", "maxDiffPixels": "0"}`.
Threshold/ratio must be finite 0–1; count a nonnegative integer. Choose count or
ratio, not both. Unknown options fail. Default threshold 0.1, ratio 0.

### Optional Playwright configuration

Supply a compiled default `PlaywrightTestConfig`. Fixtures, setup/teardown,
reporters, timeouts, E2E projects, and native `webServer` are supported. Declare
all modules/executables; relative lifecycle/server/reporter paths resolve against
compiled config. Existing servers are never reused. Projects share one app origin.

`testDir`, `testMatch`, and `testIgnore` are rejected: Bazel selects specs.
VRT rejects projects. Managed isolated browsers reject channels, executable
selection, and headed mode. Runner owns output paths, list/JUnit reports, and
snapshot policy; CLI config/reporter/output overrides are rejected.

Managed defaults: headless Chromium, one worker, no retries, 30-second tests,
1280×720, en-US, UTC, light theme, reduced motion. VRT disables animations,
hides caret, and uses CSS-scale screenshots; config can select device scale.
Custom reporters write under `VRT_OUTPUTS`, avoiding `junit.xml` and `artifacts`.
Upload offline-action reports afterward. See [E2E configuration](e2e.md).

### Visual modules and gallery

Import from `@rules-web-e2e/vrt/visual`:

| Export | Contract |
| --- | --- |
| `ComponentVisualModule<Node>` | Stable `id`, `title`, readonly `visuals`; optional `renderShell(children)` |
| `ComponentVisual<Node>` | Stable `visualId`, `name`, `render(props?)`; optional async `beforeCapture`, `getScreenshotElement`, and `vrt` |
| `ComponentVisualVrtOptions` | `capture`, `screenshotName`, `viewport`, `deviceScaleFactor`, `documentLanguage`, `theme`, `hoverSelector` |
| `VisualCapture` | VRT options plus `id`, `name`, `screenshotName` |
| `VisualGallery` | `captures`, async `mount({story, props})`, `prepareCapture()`, `unmount()` |
| `visualCaptures(modules)` | Metadata for VRT-enabled cases |
| `validateCaptures(value)` | Asserts nonempty, valid, unique `VisualCapture[]` |
| `installVisualGallery(modules, renderer)` | Installs `window.mount`, `window.unmount`, `window.rulesVisuals` |

Modules are registered explicitly; filenames do not discover them. Mount IDs
are `${module.id}/${visual.visualId}`. Render callbacks must finish committed
rendering, preserve roots for prop updates, surface errors, and clean up on unmount.
Spec props must be serializable. `vrt: false` excludes a case.

Capture defaults to element bounds (`getScreenshotElement` or `#root`);
`'viewport'` skips element selection. Viewport dimensions and density are positive
integers. Theme is light/dark; document language changes HTML language, not locale.
`hoverSelector` moves the pointer before `beforeCapture`; preparation waits for fonts.
Names are single safe filenames, optionally `.png`; defaults combine kebab-cased
final module-ID segment and visual ID. Duplicate IDs/names fail.

### Custom server types

Import from `@rules-web-e2e/vrt/server`:

| Export | Contract |
| --- | --- |
| `ServerContext` | `root` (target package), `inputs` (runfiles tree), private `cache`, `host` (`127.0.0.1`) |
| `RunningServer` | Ready HTTP `url` with explicit port; `close(): void \| Promise<void>` |
| `ServerAdapter` | `(context) => RunningServer \| Promise<RunningServer>`; compiled default export |
| `serveDirectory(directory, entryPoint?, host?)` | `Promise<RunningServer>`; defaults `index.html`, `host = false`; host mode permits declared sandbox links |

Adapters own readiness and cleanup, including partial startup failures.
Runner cleans private scratch state, retaining reports and failure artifacts.
Console forwarding filters common Cookie/Authorization header lines, not arbitrary
sensitive data in reports, traces, or application output.
See [custom servers](customization.md).
