# rules_web_e2e

Bazel rules for native Playwright end-to-end tests, component browser tests,
and visual regression testing (VRT). All three use a pinned Linux Chromium
container managed by Testcontainers. Applications own their server, UI shell,
fixtures, and strict TypeScript checks.

| Test                      | Bazel API                | Consumer files                           |
| ------------------------- | ------------------------ | ---------------------------------------- |
| Navigation and user flows | `web_e2e_test`           | `*.spec.ts`                              |
| Component interactions    | `component_browser_test` | `*.browser.spec.tsx` and a gallery       |
| Screenshot comparison     | `component_visual_test`  | `*.visual.tsx` modules and reviewed PNGs |

Start with the [user guide](docs/getting-started.md), then consult the
[API reference](docs/api.md). The [documentation index](docs/README.md) includes
custom servers, remote URLs, rendering stability, and architecture.

## API

### Bazel targets

```starlark
load("@rules_web_e2e//e2e:defs.bzl", "web_e2e_test")
load("@rules_web_e2e//component:defs.bzl", "component_browser_test")
load("@rules_web_e2e//vrt:defs.bzl", "component_visual_test")
```

All three macros accept the same source, dependency, and endpoint attributes:

| Attributes                           | Purpose                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `name`, `config`, `srcs`             | Target name, Playwright config, and declared test/app sources      |
| `playwright_test`, `playwright_core` | Matching consumer npm `/dir` targets, currently version `1.63.0`   |
| `deps`, `data`                       | Runtime dependencies, assets, and a strict TypeScript check target |
| `server`                             | Compiled TypeScript server adapter                                 |
| `vite`, `server_config`              | Built-in Vite adapter and consumer Vite config                     |
| `base_url` or `base_url_env`         | Existing app URL or the environment variable containing it         |
| `env`, `env_inherit`                 | Explicit environment values and inherited variable names           |
| `network_origins`                    | Additional browser-accessible HTTP(S) origins                      |

Choose exactly one endpoint source: `server`, `vite` plus `server_config`,
`base_url`, or `base_url_env`. Only `component_visual_test` accepts `baselines`
and `baseline_dir` and creates a `<name>.update` target. Each visual target must
own a separate baseline directory.

### TypeScript configuration

Import config helpers from the Bazel-linked `@rules-web-e2e/vrt` package:

| Helper                   | Options                                     | Test discovery                                    |
| ------------------------ | ------------------------------------------- | ------------------------------------------------- |
| `e2eConfig`              | `root`, optional `viewport`                 | `*.spec.ts`, excluding component and visual specs |
| `componentBrowserConfig` | `root`, `gallery`, optional `viewport`      | `*.browser.spec.ts` / `*.browser.spec.tsx`        |
| `visualConfig`           | `root`, optional `viewport` and `tolerance` | Generated captures from registered visual modules |

```ts
import {defineConfig} from '@playwright/test'
import {componentBrowserConfig} from '@rules-web-e2e/vrt'
import {fileURLToPath} from 'node:url'

export default defineConfig(
  componentBrowserConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    gallery: './gallery.html',
  }),
  {timeout: 45_000}
)
```

Run configs through the Bazel targets so the runner supplies browser connections
and artifact paths. Defaults include a 1280×720 viewport, en-US locale, UTC,
light theme, and one worker. VRT uses Playwright's pixelmatch comparison;
`tolerance` is the allowed mismatched pixel ratio (default `0`).

### Visual modules and custom servers

| Export                        | Import path                 | Purpose                                                                         |
| ----------------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| `ComponentVisualModule<Node>` | `@rules-web-e2e/vrt/visual` | Declare `id`, `title`, optional `renderShell`, and `visuals` in `.visual.tsx`   |
| `ComponentVisual<Node>`       | `@rules-web-e2e/vrt/visual` | Declare `visualId`, `name`, `render`, optional capture hooks, and `vrt` options |
| `installVisualGallery`        | `@rules-web-e2e/vrt/visual` | Register modules with a consumer `{render, unmount}` renderer                   |
| `ServerAdapter`               | `@rules-web-e2e/vrt/server` | Start a ready server and return `{url, close}`                                  |

Native component specs use `mount('moduleId/visualId', props)` with serializable
props. The same gallery supplies VRT captures; `vrt: false` keeps a visual out
of screenshots. Providers, CSS, and rendering remain consumer-owned.

See the [full API reference](docs/api.md) for all attributes, defaults, exported
types, and lifecycle contracts, or the [setup guide](docs/getting-started.md)
for complete Bazel wiring.

## Try it

Install Bazelisk and start a local Docker daemon. From this checkout:

```sh
cd examples/react
bazelisk test //:e2e_test //:component_test //:component_visual_test
```

Bazel installs locked dependencies. Browser targets are manual, local, and
uncached: invoke them explicitly, including in CI. Screenshot baselines are
validated on Linux amd64.

To intentionally replace the component baselines:

```sh
bazelisk run //:component_visual_test.update
```

Review the PNG diff before committing. Updates replace the target's owned PNGs
only after a successful full capture.

See [development and releases](docs/development.md) for build checks, commit
hooks, and BCR publishing.
