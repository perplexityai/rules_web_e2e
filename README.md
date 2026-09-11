# rules_web_e2e

Bazel rules for Playwright E2E, component browser tests, and visual regression
testing (VRT), using Testcontainers and a pinned Linux Chromium image.
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
    shell = ":editor_shell",
    matching = ":matching",
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
| `playwright`                | Optional reusable runtime target grouping client packages and a pinned image; minimum 1.63.0 |
| `matching`                  | Compiled VRT comparison policy; render settings stay in `.visual.tsx`                        |

For example, compile this `matching.ts` module:

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

Install Bazelisk and start a local Docker daemon. From this checkout:

```sh
cd examples/react
bazelisk test //:e2e_test //:component_test //:component_visual_test
bazelisk run //:component_visual_test.update
```

Review PNG changes before committing. Browser targets are manual, local, and
uncached; select them explicitly in CI. Screenshot baselines are validated on
Linux amd64. Each VRT target owns a separate baseline directory.

See [development and releases](docs/development.md) for build checks, hooks,
and BCR publishing.
