# Component visual regression tests

`component_visual_test` generates Playwright Test captures from consumer `.visual.tsx` modules against a
Playwright server in a digest-pinned Linux container. It provides comparison,
failure artifacts, and an explicit `<name>.update` target. The runtime is consumed
through Bazel; a separate npm publication is not required. See
[architecture](architecture.md) and [visual testing design](visual-testing-design.md)
for the rationale. Start with the [user guide](getting-started.md) for dependency wiring
and the [API reference](api.md) for all supported attributes.

## Try the standalone example

Install Bazelisk and Docker, start a local Docker daemon, then:

```sh
cd examples/react
bazelisk test //:visual_test
bazelisk run //:visual_test.update
```

Bazel installs the locked npm dependencies. The update command replaces this
example’s PNG baselines only after every test succeeds. Review the image diff
before committing. Each VRT target must own a separate baseline directory.

## Consumer setup

Follow [getting started](getting-started.md) for dependency wiring and built
input targets. Register `.visual.tsx` modules with `installVisualGallery` in
your gallery entry point, then build it as a directory of static assets.

```starlark
load("@rules_web_e2e//component:defs.bzl", "browser_shell")
load("@rules_web_e2e//vrt:defs.bzl", "component_visual_test")

browser_shell(name = "gallery", assets = ":built_gallery", entry_point = "gallery.html")
component_visual_test(
    name = "visual_test",
    shell = ":gallery",
    matching = ":matching",
    baselines = glob(["__screenshots__/*.png"], allow_empty = True),
)
```

The consumer build owns strict typechecking, transpilation, providers, CSS,
fonts, and generated assets. The runner does not compile the application.
See [the complete example](../examples/react/BUILD.bazel).

A compiled `matching` module exports `VisualMatching`: configure per-pixel
`threshold` and either `maxDiffPixels` or `maxDiffPixelRatio`. Defaults use
Playwright's pixelmatch comparator with threshold 0.1 and zero mismatched pixels.
Viewport, language, theme, density, and capture hooks remain visual options.
The gallery waits for loaded fonts; hooks should wait for application readiness.

A custom compiled `server` or existing URL can replace `shell`; see
[customization](customization.md). Most consumers need no Playwright config.

## Execution contract

- Tested versions: Bazel 8.6/9.2, Playwright Test/core 1.63.0, Vite 8.2.2, React 19.2.8. Initial screenshot support is Linux amd64.
  macOS/arm64 screenshot equivalence has not been validated.
- The image, including fonts and browser binaries, is pinned by digest. Its
  Playwright version must match the consumer’s `playwright-core` package.
  The runner copies that declared package into the container; it does not run
  npm installs or mount source paths inside Docker.
- A local Docker daemon must be reachable by Testcontainers. Docker connection
  variables are inherited explicitly. The browser tunnel exposes only the
  fixture server’s exact host and port by default. Prefer declared fixtures;
  `network_origins = ["https://fixtures.example"]` explicitly permits an
  additional host/port and introduces an external dependency.
- Each invocation owns a browser container, control relay, and internal network. Tests run locally, outside
  Bazel’s filesystem sandbox, and disable result caching. Docker/browser tests
  are `manual`; invoke them explicitly in a dedicated CI job.
- Built inputs and dependencies are copied from the runfiles manifest into a private
  tree. Compare and update use only declared
  `env`/`env_inherit` variables and fresh home/cache directories. See
  [the isolation boundaries](testcontainers-vrt.md).
- Compare mode copies declared baselines to a temporary directory. Missing or
  changed screenshots fail without modifying source baselines. Playwright writes
  JUnit and image attachments under `TEST_UNDECLARED_OUTPUTS_DIR`.
- Update mode captures into a fresh directory, then synchronizes PNGs into the
  source directory, removing stale PNGs and retaining other files. It rejects
  empty captures, path traversal, directory symlinks, and CLI filters. Do not
  run concurrent updates against the same baseline directory.
- `execution_timeout_seconds` bounds each Playwright invocation (default: 180
  seconds each for discovery and capture). Managed server startup has a separate
  30-second deadline; Bazel’s `timeout` independently bounds the whole test. Failed updates leave existing
  baselines intact and print the artifact directory.
