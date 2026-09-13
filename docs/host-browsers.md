# Host browsers and VRT-only containers

| Target | Browser | Network behavior |
| --- | --- | --- |
| `web_e2e_test` | Version-matched host Chromium | Host network |
| `component_browser_test` | Version-matched host Chromium | Host network |
| `visual_test` | Pinned Linux amd64 container | Declared-origin tunnel |
| `component_visual_test` | Pinned Linux amd64 container | Declared-origin tunnel |

Only VRT initializes Testcontainers, Ryuk, or the control relay, inherits Docker
settings automatically, or consumes image requirements. Existing VRT image pins,
matching policy, baseline directories, and `.update` commands remain in place.

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

## AGI migration

The inspected Playwright 1.63 migration checkout already has
`PLAYWRIGHT_PROCESS_DATA` and `PLAYWRIGHT_PROCESS_ENV` in
`tools/rules/frontend/playwright/process_runtime.bzl`. Its data supplies
`@playwright//:chromium`, `:chromium-headless-shell`, and `:ffmpeg`, and its cache
path is `$(rootpath @playwright//:chromium)/../`. Reuse those artifacts rather than
introducing a second host cache.

Update the two common wrappers in `tools/rules/frontend/playwright/defs.bzl`:

```starlark
# Arguments to web_e2e_test / component_browser_test inside AGI's wrappers:
data = _unique(PLAYWRIGHT_PROCESS_DATA + data),
env = {
    "PLAYWRIGHT_BROWSERS_PATH": PLAYWRIGHT_PROCESS_ENV["PLAYWRIGHT_BROWSERS_PATH"],
} | env,
```

Preserve each wrapper's existing data/dependency aggregation and environment
(e.g. `_DEFAULT_ENV` for E2E). Do not copy its HOME override: this runner owns
fixture HOME isolation. Add other process-runtime environment entries only where
AGI intentionally needs them, such as an existing host-requirements policy.

Remove E2E `network_origins` / `network_origins_env` forwarding, including the
CDN/API list passed by `tools/rules/frontend/e2e/defs.bzl`. Host tests do not enforce
that restriction. Retain those settings on `tools/rules/frontend/vrt/defs.bzl`
targets. Keep AGI's ECR image override for VRT; host suites ignore it. Keep existing
suite tags/names and deployed/local selection; CI can separate Docker preparation
by `visual_test` versus `component_browser_test` / `e2e_test` tags.

This is a migration recipe for the inspected checkout, not a claim that AGI's
consumer changes have already landed or its full suite has been validated here.

## FormatJS migration

The inspected `packages/editor/vrt/BUILD.bazel` already splits `e2e_test`,
`component_test`, and `visual_test`, sharing one `:playwright` runtime. Keep those
target declarations and the existing compiled server/gallery inputs.

Provision host Chromium using FormatJS's locked Playwright package and export
`PLAYWRIGHT_BROWSERS_PATH` before running the two interaction targets. Keep Docker
setup for `visual_test` and its update target. CI may run host interaction tests on
Linux/macOS while retaining Linux amd64 for screenshot baselines. The FormatJS
consumer suite has not been executed by this repository's checks.

## Compatibility changes

- E2E/component execution uses the host OS and network; diagnostic screenshots
  can vary across OSes. Pixel baseline tests belong in VRT targets.
- `network_origins` and `network_origins_env` fail at analysis time on host targets.
- Consumer `use.connectOptions`, including project overrides, is rejected on
  host targets because Playwright Test launches the browser directly.
- Custom runtime versions need a matching host browser. A Docker image is only
  mandatory when that runtime is used by VRT or `playwright_images`.


## Consumer-built OCI images for VRT

Image construction stays in the consuming repository. Pass a digest-pinned image
reference through the shared runtime's `image` attribute:

```starlark
playwright_runtime(
    name = "playwright",
    test = ":node_modules/@playwright/test/dir",
    core = ":node_modules/playwright-core/dir",
    version = "1.63.0",
    image = "registry.example/team/vrt@sha256:<image-digest>",
)
```

The image must support Linux amd64 and contain Node, the matching Playwright
Chromium installation under `/ms-playwright`, and the OS libraries/fonts needed
by the application. The rules copy the selected `playwright-core` into the image
at execution time and launch its browser server. The same image runs the control
relay. Build or extend the image in the consumer's OCI pipeline; there is no
image-building action in these rules. The bundled default remains a convenience.

AGI can retain its ECR runtime image; FormatJS can supply a custom image with its
fonts and rendering dependencies. This image is ignored by host interaction
tests that share the runtime. Ryuk is still a separate helper requirement for
VRT, exposed by `playwright_images`; constructing a browser image does not remove
that helper. Preload all manifest images before execution; existing Ryuk image
identity must match the pin before reuse.
