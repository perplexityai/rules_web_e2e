# Host browsers and VRT actions

| Target | Browser | Network behavior |
| --- | --- | --- |
| `web_e2e_test` | Version-matched host Chromium | Host network |
| `component_browser_test` | Version-matched host Chromium | Host network |
| `visual_test` | Declared Linux runtime; actiond by default, Linux amd64 host with `host_vrt = True` | Action-local loopback |
| `component_visual_test` | Declared Linux runtime; actiond by default, Linux amd64 host with `host_vrt = True` | Action-local loopback |

VRT uses [actiond](actiond.md) by default; host interaction tests keep their
existing browser setup.

On controlled Linux amd64 host, VRT can run without actiond by setting
`host_vrt = True` on visual target and invoking ordinary `bazel test`.
Declared browser, Node, fonts, and fixtures remain Bazel inputs, while
host supplies libc, Bash, and kernel behavior. Bazel's local sandbox exposes
declared inputs through links, which host mode accepts. Treat CI image
as part of screenshot environment and recapture baselines when switching
execution modes. This mode does not provide worker's VM isolation or its
cross-host rendering contract.

## Hermetic E2E and component tests

Supply `browser` to run ordinary test's server, Playwright, and Chromium together
in actiond Linux amd64 action. Omit it for native host execution.

```starlark
web_e2e_test(
    name = "e2e_test",
    browser = ":linux_browser",
    server = ":fixture_server",
    tests = ":compiled_specs",
)
```

`component_browser_test` accepts same `browser` and `target_platform` attributes.
Reuse `linux_chromium_runtime` from VRT. No host cache or `apt-get` setup needed.
Add `--strategy=TestRunner=remote,local` to [actiond configuration](actiond.md).
These native Bazel test actions: retries, `--runs_per_test`, and
`--nocache_test_results` launch browser again. Failures return nonzero test
exit status; reports use standard Bazel test outputs. Ordinary tests have no
capture/update targets and do not update baselines.

Action has loopback-only networking and rejects inherited environment values.
Declare fixture assets, APIs, and fonts. Native Playwright `webServer` and projects
 supported; browser channels, executable overrides, and headed mode not.
Live-service tests and native macOS coverage should retain host mode.

## Provision once, then test

Install Chromium with same Playwright version as `playwright_runtime.test`
and `.core`, using consumer's locked package manager:

```sh
export PLAYWRIGHT_BROWSERS_PATH="$(pwd)/.playwright-browsers"
pnpm exec playwright install chromium
bazel test //path:e2e_test //path:component_test
```

Prepare Linux system dependencies in CI image/setup step (Playwright's
`install --with-deps chromium` can do this where supported). Tests do not download
browsers or install system packages. Existing cache with wrong browser
revision fails with Playwright's missing-executable error. Before host tests run,
setup check launches each project's selected Chromium, validates its reported
version against Playwright metadata, and closes it. This also rejects stale
binaries placed into newer revision's cache directory. Do not use `0` for
`PLAYWRIGHT_BROWSERS_PATH`; rules need explicit provisioned directory.

Bazel tests inherit absolute `PLAYWRIGHT_BROWSERS_PATH` automatically.
Alternatively, declare browser artifacts in `data` and supply runfiles-relative
path in target `env`. Runner resolves that path against its original runfiles
working directory before it resets fixture HOME/cache directories. Browser
files must include Chromium/headless shell and any FFmpeg binary required by
suite. Caller-owned Bazel browser repositories supported; these rules do not
introduce another browser downloader or repository format.

Tests use `no-remote-exec` to stay local while permitting
[normal Bazel result caching](e2e.md#result-caching), including remote cache reuse.
Non-hermetic suites must opt out with caller tags such as `external` plus `no-cache`.
An externally provisioned host browser cache is an undeclared environmental input;
such suites must opt out unless that environment is tracked in their cache key.
Bazel-provisioned browser artifacts make browser files declared inputs. Reuse
results only across compatible, controlled host environments. Neither choice
provides VRT's controlled OS/fonts rendering environment.

## Consumer migration

For AGI, keep existing host browser data and `PLAYWRIGHT_BROWSERS_PATH` wiring.
In shared component/page VRT wrappers, add `browser` pointing to
`browser_runtime` built from caller's pinned packages and browser archive. Preserve built galleries,
custom configs, server executables, `data`, matching, and baseline directories.
VRT rule expands `$(rootpath ...)` in server environment JSON and configures
inputs for Linux amd64. Set `target_platform` when native toolchains need
additional ABI constraints. Remove Docker preparation, image manifests, and
Docker/network tags from VRT lane; route it to actiond worker.

Existing VRT external-origin exceptions cannot carry over: vendor those assets
or serve declared fixtures inside action. Keep live external checks in host
E2E targets. Do not silently remove assertions or retain networked VRT fallback.

For FormatJS, editor keeps its Vite/StyleX bundle, matching, shell, and host
interaction targets. Its VRT change :

```starlark
component_visual_test(
    name = "visual_test",
    browser = ":linux_browser",
    target_platform = "//platforms:linux_x86_64_gnu",
    shell = ":editor_shell",
    matching = ":vrt_matching",
    playwright = ":playwright",
    baselines = glob(["__screenshots__/*.png"], allow_empty = True),
)
```

`:linux_browser` caller-owned [browser_runtime](browser-runtime.md).
Actual editor gallery built, captured, locally applied references, and
compared all eight screenshots in actiond's process sandbox with this interface. That check does not establish full AGI or
FormatJS CI migration, or macOS worker support.

`playwright_runtime` now groups only matching npm packages and their version.
Replace its former `image` setting with declared package/browser runtime assembled
by `browser_runtime_archive`. Remove `playwright_images` and Ryuk preload jobs.


## Assemble an existing browser download

`playwright_browser_installation` accepts caller-owned Chrome for Testing
headless-shell and FFmpeg downloads. It reads cache revisions from declared
Playwright package; no handwritten `chromium_headless_shell-<revision>` paths
 needed:

```starlark
load("@rules_web_e2e//playwright:browser.bzl", "playwright_browser_installation")

playwright_browser_installation(
    name = "browsers",
    chromium = "@rules_browsers_chrome_linux//:info",
    ffmpeg = ":downloaded_ffmpeg",
    playwright = ":playwright",
)
```

Use platform `select()` for Linux x64 and macOS x64/arm64 browser/FFmpeg labels.
For nested declared directories, set `chromium_path` and `ffmpeg_path`.
Defaults: `chrome-headless-shell` and `ffmpeg-linux` (Linux) or `ffmpeg-mac` (macOS).
Paths relative. No dot segments. No directory scan.
Pass this target in test `data` and set
`PLAYWRIGHT_BROWSERS_PATH = "$(rootpath :browsers)"` as before.

To upgrade, change caller's Chromium pin and compatible Playwright npm
packages (including `playwright_runtime(version = ...)`). Update
`rules_browsers` catalog pin if necessary. Select FFmpeg download revision
listed in new Playwright package's `browsers.json`; helper handles its
cache directory name. Re-run host and VRT suites and review any intentional
baseline changes. Library/font preset upgrades remain explicit separate choice.
