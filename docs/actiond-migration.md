# Replace Testcontainers with actiond

Active implementation plan. The existing Chromium prototype in PR #27 passes
through actiond's Linux amd64 VM after applying `actiond-advice.patch` (upstream
actiond PR #48). Production VRT still uses Testcontainers.

## Execution contract

The fixture server, Playwright test runner, Chromium, and screenshot comparison
execute together as a Linux Bazel action. Browser files, libraries, fonts, Node,
test code, assets, and baselines are declared inputs. The executor provides
isolation; no Docker daemon, image pulls, or reaper run inside the action.

Callers may construct their own OCI image. Packaging must convert its pinned
contents into declared runtime files before execution, including an explicit
browser executable and architecture. Building Chromium from source is optional.
Keep the rule compatible with REAPI rather than depending on actiond's CLI inside
the test runner.

Baseline capture produces declared downloadable outputs. A local `.update`
wrapper applies successful captures to the source tree using the existing
destination validation. Failed or empty captures must not replace baselines.

## Implementation sequence

1. Add declared browser runtime metadata and direct browser launch support.
   Exercise the existing gallery and native screenshot runners, not just the
   standalone HTML prototype.
2. Package a caller-owned pinned runtime through Bazel, removing the prototype's
   manual Docker extraction prerequisite from the supported execution path.
3. Add Linux execution actions for comparison and baseline capture, plus the
   local baseline application wrapper. Select amd64 explicitly; an ARM64 worker
   must not silently produce shared amd64 baselines.
4. Validate on a patched actiond VM with local fallback disabled. Check artifacts,
   baseline updates, failures, timeouts, cancellation, and network isolation.
5. Provide concrete AGI and FormatJS callsite migrations, including built assets,
   caller fixture servers, custom Playwright configuration, and native specs.
   External services must become declared local fixtures or have an explicitly
   documented unsupported migration case; the VM has no external network.
6. Remove Testcontainers, Ryuk, their patches, and Docker-specific VRT plumbing
   once the replacement passes these checks. Update examples, CI, and docs.

## Completion evidence

- Both `visual_test` and `component_visual_test` compare and update screenshots
  through actiond using the production runner.
- Browser runtime acquisition is pinned and separate from offline execution.
- Screenshot outputs and reports survive remote execution and failed tests.
- Baseline application is local, explicit, and refuses failed or empty captures.
- Host E2E/component browser tests continue to work independently.
- AGI and FormatJS migration examples describe the actual supported interface.
- Any necessary actiond changes remain isolated patches with reproductions and
  upstream status. The current required patch enables memory-advice syscalls;
  no browser-driven relaxation of the action sandbox has been established as
  necessary.

Keep dependent PRs stacked with ordinary Git and descriptions concise. Do not
mark the goal complete based solely on the standalone prototype passing.

## Current progress

The runtime branch adds `browser_runtime` metadata, direct Chromium launch, and
output-only baseline capture. Both production VRT modes pass capture and
comparison under the actual actiond process runner, with JUnit reports. The
diagnostic prepares existing Bazel runfiles and injects a browser descriptor;
it does not yet prove the public rule's remote execution or runtime packaging.
The legacy backend remains during this integration work.

Next: package a declared runtime filesystem that supplies `/bin/sh` and the ELF
loader in the real VM, then execute the full suites through Bazel/REAPI. Native
Playwright web servers demonstrated the shell requirement. Keep any actiond
filesystem support isolated from the already-upstreamed kernel patch.

The separate `actiond-input-rootfs.patch` now implements declared runtime
directories at Linux absolute paths. Its full actiond build and unit tests pass;
PR #28's production VM workflow is validating the complete runtime. The local
remote-result handler preserves failure artifacts, propagates test exit status,
and refuses failed or empty baseline updates. Its focused filesystem tests pass.
The public remote action and `.update` rules still need to use this handler.

The declared-browser branch of both public rules now creates remote comparison
and capture actions, with local test/update consumers. Analysis verifies Linux
amd64 execution constraints, `no-local`, and the declared runtime input path.
The actiond patch also accepts that path through a declared command environment
variable (`input-rootfs-env`), since generated artifact paths are determined
during rule analysis. This updated patch passes full build and unit tests.
The bootstrap's real-subprocess test proves that a failed consumer test produces
downloadable artifacts and a failing local result.

The first production VM CI attempt built actiond successfully, then failed while
copying a two-file Bazel output list as one filename. The executable query is
fixed. Full VM execution and public-rule end-to-end validation remain pending.
