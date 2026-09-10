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
