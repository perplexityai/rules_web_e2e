# rules_web_e2e

Bazel rules for Playwright E2E, component browser tests, and visual regression
testing (VRT). E2E and component tests use host Playwright browsers; only VRT
runs in isolated actiond Linux actions with caller-owned browser runtimes.
Bring compiled tests, your own server, or a built shell/template. Your build
owns typechecking and bundling; the rules own execution and baseline updates.

## API

```starlark
load("@rules_web_e2e//e2e:defs.bzl", "web_e2e_test")
load("@rules_web_e2e//component:defs.bzl", "browser_shell", "component_browser_test")
load("@rules_web_e2e//vrt:defs.bzl", "component_visual_test", "visual_test")

web_e2e_test(
    name = "editor_e2e",
    tests = ":compiled_e2e_specs",
    config = ":compiled_playwright_config",  # use.baseURL + optional webServer
)

browser_shell(
    name = "editor_shell",
    assets = ":built_editor_gallery",
    entry_point = "gallery.html",
)

component_browser_test(
    name = "editor_browser",
    tests = ":compiled_browser_specs",
    shell = ":editor_shell",
)

component_visual_test(
    name = "editor_vrt",
    browser = ":linux_browser",  # browser_runtime; see docs/browser-runtime.md
    shell = ":editor_shell",
    matching = {"threshold": "0.1", "maxDiffPixels": "0"},
    baselines = glob(["screenshots/*.png"], allow_empty = True),
    baseline_dir = "screenshots",
)
```

| Input                       | Contract                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `tests`                     | Built ESM specs and dependencies; source files are typechecked/transpiled by the producer    |
| `config`                    | Compiled native Playwright config: base URL, optional webServer, fixtures, reporters, and timeouts |
| `server`                    | Compiled adapter returning a ready URL and cleanup callback                                  |
| `shell`                     | Built HTML/JS/CSS directory plus its entry point; served without a bundler                   |
| `base_url` / `base_url_env` | Existing application endpoint, replacing `server` or `shell`                                 |
| `playwright`                | Optional reusable runtime target grouping client packages; minimum 1.63.0 |
| `browser`                  | Required VRT runtime containing declared Linux Chromium, Node, libraries, and fonts |
| `matching`                  | Declared comparison options or a compiled policy module; render settings stay in `.visual.tsx` |

Both component and page VRT accept the same `matching` dictionary. Values are
JSON numeric strings because Starlark has no floating-point values; for example,
`matching = {"maxDiffPixelRatio": "0.01"}` allows a one-percent mismatch budget.
The options are declared action inputs, without an environment adapter or a
TypeScript compilation target. See the [matching reference](docs/api.md#vrt-matching).

Existing compiled `matching.ts` modules remain supported:

```ts
import type {VisualMatching} from '@rules-web-e2e/vrt'

const matching: VisualMatching = {threshold: 0.1, maxDiffPixels: 0}
export default matching
```

Use `visual_test(tests = ":compiled_visual_specs", config = ":compiled_playwright_config", ...)`
for page screenshots and interaction-driven VRT with native `toHaveScreenshot`.
It shares `matching`, `baselines`, `baseline_dir`, and `.update` with gallery VRT.

Native component specs mount registered visuals with
`mount('moduleId/visualId', props)`. The same gallery supplies generated VRT
captures. `ComponentVisualModule` and `installVisualGallery` are exported from
`@rules-web-e2e/vrt/visual`; server types are exported from `@rules-web-e2e/vrt/server`.

See the [setup guide](docs/getting-started.md), [full API reference](docs/api.md),
and [documentation index](docs/README.md). The API replaces the 1.0.0 source/Vite
attributes; see [migration](docs/getting-started.md#migrating-from-100).

## Try it

Provision host Chromium for interaction tests. For VRT, supply the example's
`runtime.tar` using the [package-built runtime example](docs/browser-runtime.md#build-the-example-runtime)
and configure a pinned actiond worker using [the execution guide](docs/actiond.md).

```sh
export PLAYWRIGHT_BROWSERS_PATH="$(pwd)/.playwright-browsers"
pnpm exec playwright install chromium
cd examples/react
bazelisk test //:e2e_test //:component_test
bazelisk test --config=vrt //:component_visual_test
bazelisk run --config=vrt //:component_visual_test.update
```

Review PNG changes before committing. Each VRT target owns its baseline directory.
VRT capture/comparison actions are cacheable; baseline application stays local.
Host browser targets remain manual, local, and uncached.

See [development and releases](docs/development.md) for build checks, hooks,
and BCR publishing.

See [host-browser provisioning and consumer migration](docs/host-browsers.md).

Ordinary E2E and component tests can also supply `browser` for isolated Linux execution,
without host-installed libraries. See [hermetic browser tests](docs/host-browsers.md#hermetic-e2e-and-component-tests).
