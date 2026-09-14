# Component visual regression tests

`component_visual_test` generates Playwright Test captures from consumer `.visual.tsx` modules against a
caller-owned browser runtime in an isolated Linux action. It provides comparison,
failure artifacts, and an explicit `<name>.update` target. The runtime is consumed
through Bazel; a separate npm publication is not required. See
[architecture](architecture.md) and [visual testing design](visual-testing-design.md)
for the rationale. Start with the [user guide](getting-started.md) for dependency wiring
and the [API reference](api.md) for all supported attributes.

## Try the standalone example

Build `examples/react/runtime.tar` with the [package runtime example](browser-runtime.md#build-the-example-runtime) and configure a
patched worker with [the actiond guide](actiond.md), then:

```sh
cd examples/react
bazelisk test --config=vrt //:visual_test
bazelisk run --config=vrt //:visual_test.update
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
    browser = ":linux_browser",
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

A custom compiled `server` or action-local URL can replace `shell`; see
[customization](customization.md). Most consumers need no Playwright config.

## Execution contract

- Tested versions: Bazel 8.6/9.2, Playwright Test/core 1.63.0, Vite 8.2.2, React 19.2.8. Initial screenshot support is Linux amd64.
  macOS/arm64 screenshot equivalence has not been validated.
- The declared runtime supplies Chromium, Node, libraries, and fonts. Pin it and
  keep its browser compatible with the consumer's Playwright packages.
- The fixture server and browser share an action-local loopback network. External
  services and inherited environment are unsupported; declare fixtures and `env`.
- Capture and comparison are cacheable remote actions. Their local wrappers
  download artifacts and report results; only `.update` writes source baselines.
- Built inputs are staged from their runfiles manifest into a private tree with
  fresh home/cache directories. See [the isolation boundaries](actiond.md).
- Compare mode copies declared baselines to a temporary directory. Missing or
  changed screenshots fail without modifying source baselines. Playwright writes
  JUnit and image attachments under `TEST_UNDECLARED_OUTPUTS_DIR`.
- Update mode captures into a fresh directory, then synchronizes PNGs into the
  source directory, removing stale PNGs and retaining other files. It rejects
  empty captures, path traversal, directory symlinks, and CLI filters. Do not
  run concurrent updates against the same baseline directory.
- `execution_timeout_seconds` bounds each Playwright invocation (default: 180
  seconds each for discovery and capture). Managed server startup has a separate
  30-second deadline; Bazel’s `timeout` bounds the local result test, not its input build actions. Failed updates leave existing
  baselines intact and print the artifact directory.

## Fixed and portaled visuals

Use `vrt: {capture: 'viewport'}` when content is fixed-position or rendered in a
portal outside the normal layout flow:

```ts
{
  visualId: 'dialog',
  name: 'Dialog',
  render: () => <Dialog open />,
  vrt: {capture: 'viewport', viewport: {width: 390, height: 844}},
}
```

The default `capture: 'element'` screenshots `getScreenshotElement()` (or `#root`)
using its element bounds. Selecting `document.body` does not mean viewport capture:
fixed descendants may leave the body's layout height at zero.

Viewport capture runs `beforeCapture` and waits for fonts, skips screenshot-element
selection, and uses Playwright's page screenshot assertion. It captures the visible
viewport, not the full scrollable page. `viewport` configures the browser dimensions
in either mode; `deviceScaleFactor` and the config's screenshot `scale` retain their
usual behavior. For explicit full-page screenshots use a native `visual_test` spec.
