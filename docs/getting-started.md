# Getting started

Use the presets for Linux amd64 tests. Customize the runtime or worker only when
you need different versions, fonts, architecture, or infrastructure.

## Basic: presets

Add to `MODULE.bazel`:

```starlark
bazel_dep(name = "rules_web_e2e", version = "3.4.0")

browsers = use_extension("@rules_web_e2e//playwright:extensions.bzl", "browser_presets")
browsers.linux_amd64(name = "web_browser", release = "20260921")
use_repo(browsers, "web_browser")
```

Use Playwright **1.63.0** with this preset. Set
`browser = "@web_browser//:browser"` on E2E, component, and visual targets.

Your Bazel build must supply:

- Compiled ESM specs with typechecking and runtime dependencies.
- A built HTML/JS/CSS directory wrapped in `browser_shell`, or a compiled server
  adapter. Component tests and gallery VRT need a gallery that registers visual
  modules with `installVisualGallery`.
- Playwright packages from your npm lockfile. Use `playwright_runtime` to select
  them; otherwise tests use the rules' pinned packages.

Link the gallery/server TypeScript API when needed:

```starlark
load("@aspect_rules_js//npm:defs.bzl", "npm_link_package")

npm_link_package(
    name = "node_modules/@rules-web-e2e/vrt",
    src = "@rules_web_e2e//runtime:package",
)
```

See the [test declarations](../README.md#api) and [complete React build](../examples/react/BUILD.bazel).
The rules consume build outputs; your existing TypeScript and bundler pipeline
owns their production.

## Run the example

Use Linux amd64 with writable `/dev/kvm` and `/dev/vhost-vsock`, usable
`io_uring`, and room for a 6 GiB VM. The supervisor checks prerequisites but does
not provision the host.

```sh
cd examples/react
mkdir -p .web-e2e
bazel run --script_path="$PWD/.web-e2e/run" @rules_web_e2e//worker:runner
.web-e2e/run doctor
.web-e2e/run test //:e2e_test //:component_test //:component_visual_test
.web-e2e/run run //:component_visual_test.update
```

Use `--bazel=bazelisk` before `doctor`, `test`, or `run` if needed. Ignore
`.web-e2e/` in Git and regenerate the launcher after dependency upgrades. Run it
outside `bazel run` to avoid holding Bazel's lock. Review screenshot updates.

Browser targets are `manual`; select them explicitly in CI. Retain
`bazel-testlogs/` and `.web-e2e/logs/`. See [worker options and CI buckets](worker-preset.md).

## Advanced: custom inputs or workers

| Need | Guide |
| --- | --- |
| Different Chromium/Node, extra fonts, custom Linux runtime | [Browser runtimes](browser-runtime.md) |
| Managed worker or custom execution configuration | [Manual actiond setup](actiond.md) |
| ARM64 VRT | [Apple Silicon / ARM64](macos-arm64-vrt.md) |
| Live deployed service, or host E2E/component tests | [Host browsers](host-browsers.md) |
| Custom server, providers, fixtures | [Customization](customization.md) |

Custom runtimes can use the supported worker supervisor; custom workers can use
the runtime preset. Isolated tests use declared inputs and loopback-only
networking. Live-service checks use host tests; VRT always requires isolation.

## Migrating from 1.0.0

Replace raw `srcs`/`deps` and Vite attributes with built `tests` and `browser_shell`
targets. Replace `image` with `browser`, client package attributes with
`playwright_runtime`, and `visualConfig({tolerance})` with `matching`.
Keep visual IDs and baseline filenames stable. See the [API reference](api.md).
