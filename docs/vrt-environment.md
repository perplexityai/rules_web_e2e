# VRT execution environments

The rules launch Playwright locally. The caller runs Bazel, the app server,
and Chromium together inside a pinned Linux amd64 image for stable VRT.
See [setup and migration](host-browsers.md) for CI and local update commands.

There is no Testcontainers, Ryuk, browser relay, Docker discovery, or image pull
inside the runtime. The previous shared-reaper identity concern no longer applies.

## Reproducibility boundaries

Pin the image digest, architecture, Playwright packages, browser revision, fonts,
and application inputs. Use the same image for comparison and baseline updates.
A Linux image produces Linux screenshots even when launched from macOS; direct
macOS execution produces macOS screenshots. Architecture, GPU/driver behavior,
remote data, clocks, and asynchronous application state can still affect pixels.

The runner stages declared runfiles, creates fresh HOME/cache directories,
forwards declared environment values and the explicit browser cache, and isolates
capture outputs from source baselines. Playwright owns browser launch and cleanup;
the runner owns its server/test child processes and baseline synchronization.

Tests remain manual, local, unsandboxed, and uncached. Browser and Node requests
use the supplied environment's networking. Configure network restrictions in the
caller environment and prefer declared fixtures. An image stabilizes rendering;
it does not make these tests fully hermetic Bazel actions.
