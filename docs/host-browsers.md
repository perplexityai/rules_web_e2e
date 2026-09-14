# Host browsers and VRT actions

| Target | Browser | Network behavior |
| --- | --- | --- |
| `web_e2e_test` | Version-matched host Chromium | Host network |
| `component_browser_test` | Version-matched host Chromium | Host network |
| `visual_test` | Declared Linux amd64 runtime | Action-local loopback |
| `component_visual_test` | Declared Linux amd64 runtime | Action-local loopback |

VRT uses [actiond](actiond.md); host tests keep their existing browser setup.

## Provision once, then test

Install Chromium with the same Playwright version as `playwright_runtime.test`
and `.core`, using the consumer's locked package manager:

```sh
export PLAYWRIGHT_BROWSERS_PATH="$(pwd)/.playwright-browsers"
pnpm exec playwright install chromium
bazel test //path:e2e_test //path:component_test
```

Prepare Linux system dependencies in the CI image/setup step (Playwright's
`install --with-deps chromium` can do this where supported). Tests do not download
browsers or install system packages. An existing cache with the wrong browser
revision fails with Playwright's missing-executable error. Do not use `0` for
`PLAYWRIGHT_BROWSERS_PATH`; the rules need an explicit provisioned directory.

Bazel tests inherit an absolute `PLAYWRIGHT_BROWSERS_PATH` automatically.
Alternatively, declare browser artifacts in `data` and supply a runfiles-relative
path in target `env`. The runner resolves that path against its original runfiles
working directory before it resets the fixture HOME/cache directories. Browser
files must include Chromium/headless shell and any FFmpeg binary required by the
suite. Caller-owned Bazel browser repositories are supported; these rules do not
introduce another browser downloader or repository format.

Tests remain local and uncached. A host cache is an explicit environmental input;
Bazel-provisioned browser artifacts additionally make the browser files declared
inputs. Neither choice provides VRT's controlled OS/fonts rendering environment.

## Consumer migration

For AGI, keep existing host browser data and `PLAYWRIGHT_BROWSERS_PATH` wiring.
In the shared component/page VRT wrappers, add `browser` pointing to a
`browser_runtime` built from the caller's pinned packages and browser archive. Preserve built galleries,
custom configs, server executables, `data`, matching, and baseline directories.
The VRT rule expands `$(rootpath ...)` in server environment JSON and configures
inputs for Linux amd64. Set `target_platform` when native toolchains need
additional ABI constraints. Remove Docker preparation, image manifests, and
Docker/network tags from the VRT lane; route it to the actiond worker.

Existing VRT external-origin exceptions cannot carry over: vendor those assets
or serve declared fixtures inside the action. Keep live external checks in host
E2E targets. Do not silently remove assertions or retain a networked VRT fallback.

For FormatJS, the editor keeps its Vite/StyleX bundle, matching, shell, and host
interaction targets. Its VRT change is:

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

`:linux_browser` is a caller-owned [browser_runtime](browser-runtime.md).
The actual editor gallery built, captured, locally applied references, and
compared all eight screenshots in actiond's process sandbox with this interface. That check does not establish full AGI or
FormatJS CI migration, or macOS worker support.

`playwright_runtime` now groups only matching npm packages and their version.
Replace its former `image` setting with a declared package/browser runtime assembled
by `browser_runtime_archive`. Remove `playwright_images` and Ryuk preload jobs.
