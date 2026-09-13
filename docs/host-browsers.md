# Browser execution and consumer migration

Every target launches Chromium locally in the environment running Bazel.
For VRT, run the entire suite inside a caller-owned, digest-pinned Linux amd64
OCI image. Both comparison and `.update` must use that same image. Running
Bazel directly on macOS renders macOS screenshots.

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
inputs. For stable VRT, also control the OS and fonts with the execution image described below.

## Caller-owned VRT image

Build an image containing Bazel/Bazelisk, the selected Playwright version's
Chromium/headless shell and FFmpeg, OS libraries, and application fonts.
Set `PLAYWRIGHT_BROWSERS_PATH` to its browser installation (for example,
`/ms-playwright`). The consumer's lockfile still supplies Playwright's npm
packages. Pin both image digest and CPU architecture.

Pass the image to your CI job or local container command, outside the Bazel rule:

```sh
# VRT_IMAGE is your published image including Bazel and matching browsers.
# Run from the consumer workspace on a local Docker daemon.
docker run --rm --init --platform linux/amd64 --ipc=host \
  --mount "type=bind,source=$(pwd),target=/work" --workdir /work \
  --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  "$VRT_IMAGE" bazel test //path:visual_test

# Same image, writable workspace: PNG updates persist for review.
docker run --rm --init --platform linux/amd64 --ipc=host \
  --mount "type=bind,source=$(pwd),target=/work" --workdir /work \
  --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  "$VRT_IMAGE" bazel run //path:visual_test.update
```

Use a suitable image user to keep output files writable by your developer user.
A remote Docker daemon cannot bind-mount your local checkout; stage the workspace
there through the caller's tooling instead. No Docker socket is needed inside
the image. The app server and browser share loopback networking.

The [CI workflow](../.github/workflows/ci.yaml) runs the entire VRT job in a
pinned Playwright image, with Bazel installed by the job's setup step.
See [Playwright's image requirements](https://playwright.dev/docs/docker) and
[GitHub's job container configuration](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/run-jobs-in-a-container).

## AGI migration

The inspected Playwright 1.63 migration checkout already declares
`PLAYWRIGHT_PROCESS_DATA` and `PLAYWRIGHT_PROCESS_ENV` in
`tools/rules/frontend/playwright/process_runtime.bzl`. Reuse its
`@playwright//:chromium`, `:chromium-headless-shell`, and `:ffmpeg` artifacts
for interaction tests:

```starlark
# Inside existing wrappers; preserve their other data and environment entries.
data = _unique(PLAYWRIGHT_PROCESS_DATA + data),
env = {
    "PLAYWRIGHT_BROWSERS_PATH": PLAYWRIGHT_PROCESS_ENV["PLAYWRIGHT_BROWSERS_PATH"],
} | env,
```

The runfiles-relative `$(rootpath @playwright//:chromium)/../` path remains
supported. Keep the runner's isolated HOME instead of copying the process
runtime's HOME override.

Move the ECR image selection from `playwright_runtime(image=...)` to the CI
worker/job running VRT. Prepare Bazel and matching browsers in that image or
supply the existing Linux Bazel browser artifacts. Run local baseline updates
through the same image. Remove `network_origins` and `network_origins_env`
forwarding from both Playwright/E2E and VRT wrappers; configure any required
network restrictions in the worker environment. Preserve suite names, tags,
compiled config/server inputs, and deployed/local selection.

## FormatJS migration

The inspected `packages/editor/vrt/BUILD.bazel` already separates `e2e_test`,
`component_test`, and `visual_test` with a shared `:playwright` runtime. Keep
those targets and their compiled server/gallery inputs. Provision interaction
browsers from FormatJS's locked package. Run `visual_test` and its `.update`
inside the same consumer image with matching browsers and fonts.

These are migration recipes; the full AGI and FormatJS suites have not been
executed by this repository's checks.

## Removed container API

`playwright_runtime.image`, `PLAYWRIGHT_IMAGE`, `playwright_images`, and the
default image-manifest target are removed. Image authentication, construction,
preloading, and lifecycle belong to the caller. Nonempty `network_origins` or
`network_origins_env` fail with a migration error instead of silently losing
restrictions. Consumer `use.connectOptions` is rejected for every test mode,
including project overrides: Playwright Test launches the local browser.
