# Component visual regression tests

`component_visual_test` generates Playwright Test captures from consumer `.visual.tsx` modules against
caller-owned browser runtime in isolated Linux action by default, or on
Linux amd64 host with `host_vrt = True`. It provides comparison,
failure artifacts, and explicit `<name>.update` target. Runtime consumed
through Bazel; separate npm publication not required. See
[architecture](architecture.md) and [visual testing design](visual-testing-design.md)
for rationale. Start with [user guide](getting-started.md) for dependency wiring
and [API reference](api.md) for all supported attributes.

## Try the standalone example

Follow [preset setup](getting-started.md#run-the-example), then:

```sh
cd examples/react
.web-e2e/run test //:visual_test
.web-e2e/run run //:visual_test.update
```

Bazel installs locked npm dependencies. Update command replaces this
example’s PNG baselines only after every test succeeds. Review image diff
before committing. Each VRT target must own separate baseline directory.

## Consumer setup

Follow [getting started](getting-started.md) for dependency wiring and built
input targets. Register `.visual.tsx` modules with `installVisualGallery` in
your gallery entry point, then build it as directory of static assets.

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

Consumer build owns strict typechecking, transpilation, providers, CSS,
fonts, and generated assets. Runner does not compile application.
See [the complete example](../examples/react/BUILD.bazel).

`matching` accepts dictionary of JSON numeric strings or compiled module
exporting `VisualMatching`, just like page VRT: configure per-pixel
`threshold` and either `maxDiffPixels` or `maxDiffPixelRatio`. Defaults use
Playwright's pixelmatch comparator with threshold 0.1 and zero mismatched pixels.
Viewport, language, theme, density, and capture hooks remain visual options.
Gallery waits for loaded fonts; hooks should wait for application readiness.

Custom compiled `server` or action-local URL can replace `shell`; see
[customization](customization.md). Most consumers need no Playwright config.

## Execution contract

- Tested versions: Bazel 8.6/9.2, Playwright Test/core 1.63.0, Vite 8.2.2, React 19.2.8. Initial screenshot support Linux amd64.
  macOS/arm64 screenshot equivalence has not been validated.
- Declared runtime supplies Chromium, Node, libraries, and fonts. Pin it and
  keep its browser compatible with consumer's Playwright packages.
- Fixture server and browser share action-local loopback network. External
  services and inherited environment unsupported; declare fixtures and `env`.
- Linux amd64 and ARM64 comparison use native Bazel tests. Test retries,
  `--runs_per_test`, `--nocache_test_results`, and Bazel's test timeout apply
  to browser execution. Screenshots and JUnit ordinary test outputs.
- Capture remains cacheable remote action; only `.update` applies successful
  captures to source baselines. With `host_vrt = True`, comparison and capture
  run locally. Capture actions still use `execution_timeout_seconds` because
  Bazel test timeouts do not bound build actions.
- Built inputs and harnesses immutable declared files; home/cache directories
  and browser outputs use private scratch space. See [isolation](actiond.md).
- Compare mode reads declared baselines directly from runfiles. Missing or
  changed screenshots fail without modifying source baselines. Playwright writes
  JUnit and image attachments under `TEST_UNDECLARED_OUTPUTS_DIR`.
- Update mode captures into fresh directory, then synchronizes PNGs into
  source directory, removing stale PNGs and retaining other files. It rejects
  empty captures, path traversal, directory symlinks, and CLI filters. It also
  rejects baseline edits made during capture and concurrent updates to same
  directory. Interrupted update may leave `.vrt-update.lock` directory
  beside baselines; inspect baselines before removing that stale lock.
- `execution_timeout_seconds` bounds each Playwright invocation (default: 180
  seconds each for discovery and capture). Managed server startup has separate
  30-second deadline; Bazel’s `timeout` also bounds native comparison tests, but does not bound capture build actions. Failed updates leave existing
  baselines intact and print artifact directory.

## Fixed and portaled visuals

Use `vrt: {capture: 'viewport'}` when content fixed-position or rendered in
portal outside normal layout flow:

```ts
{
  visualId: 'dialog',
  name: 'Dialog',
  render: () => <Dialog open />,
  vrt: {capture: 'viewport', viewport: {width: 390, height: 844}},
}
```

Default `capture: 'element'` screenshots `getScreenshotElement()` (or `#root`)
using its element bounds. Selecting `document.body` does not mean viewport capture:
fixed descendants may leave body's layout height at zero.

Viewport capture runs `beforeCapture` and waits for fonts, skips screenshot-element
selection, and uses Playwright's page screenshot assertion. It captures visible
viewport, not full scrollable page. `viewport` configures browser dimensions
in either mode; `deviceScaleFactor` and config's screenshot `scale` retain their
usual behavior. For explicit full-page screenshots use native `visual_test` spec.

For hover states, set `vrt.hoverSelector` to CSS selector for visible
target. Runner moves real browser pointer after mounting visual and
before calling `beforeCapture`, so hook can assert `:hover` styles.

## Build the capture catalog

Pass `capture_manifest = ":gallery-captures.json"` to use a declared JSON catalog
instead of launching a discovery browser. The file may be a build output.
It contains the array returned by `visualCaptures(modules)` from the same visual
metadata used by the gallery. Generate both from one source when possible.

```json
[{"id":"Counter/default","name":"Counter / Default","screenshotName":"counter.png"}]
```

The catalog participates in Bazel's input hash. Each worker checks it against the
loaded gallery before taking screenshots; missing stories and stale options fail.
Omit it only for galleries that need browser execution to discover their catalog.
