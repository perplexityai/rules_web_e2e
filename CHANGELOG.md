# Changelog

## Unreleased

### Breaking compatibility: preload VRT images

VRT no longer pulls images or authenticates to registries during execution.
Preload every image in the runtime manifest before testing or updating baselines.
Existing Ryuk containers must match the pinned image; unverifiable or mismatched
reapers fail without being stopped. See [setup](docs/api.md#vrt-image-manifest-and-ci-preloading).

### Breaking compatibility: host browser execution

`web_e2e_test` and `component_browser_test` now launch on the host. Provision a
version-matched browser and supply `PLAYWRIGHT_BROWSERS_PATH` before upgrading.
Remove their `network_origins`, `network_origins_env`, and `use.connectOptions`;
host browsers use host networking. Only VRT retains Testcontainers and image
requirements. See [migration guidance for AGI and FormatJS](docs/host-browsers.md).

### Breaking compatibility: Playwright suite selection

Before upgrading, remove explicit `testDir`, `testMatch`, and `testIgnore` from
consumer Playwright configs **and every project**. These settings now fail with
an error instead of being silently overwritten, including empty filter arrays.
Select compiled specs through the Bazel target's `tests` attribute. Use separate
Bazel targets for independent suites and suite-owned fixtures for setup; see
[the migration examples](docs/e2e.md#suite-selection-belongs-to-bazel).

## 3.2.0 (2026-09-16)

## What's Changed
* fix: run VRT on all CI events by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/38
* feat: support local ARM64 VRT on macOS by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/40


**Full Changelog**: https://github.com/perplexityai/rules_web_e2e/compare/v3.1.0...v3.2.0

## 3.1.0 (2026-09-14)

## What's Changed
* test: prototype declared Chromium execution with actiond by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/27
* feat: run VRT with declared Linux browser inputs by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/28
* feat: replace Testcontainers with actiond for VRT by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/29
* feat: run VRT without actiond rootfs mappings by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/31
* docs: remove obsolete actiond rootfs proposal references by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/32
* feat: replace OCI with public Chromium runtime helpers by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/35
* feat: support hermetic E2E and component tests by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/36
* fix: support Node 26 runtimes and preserve VRT JUnit by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/37


**Full Changelog**: https://github.com/perplexityai/rules_web_e2e/compare/v3.0.0...v3.1.0

## 3.0.0 (2026-09-13)

## What's Changed
* feat: expose runtime image manifest for CI preloading by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/19
* feat: support viewport capture for component visuals by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/18
* feat: scope Testcontainers to visual regression tests by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/21
* fix: use an available context for CI browser cache by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/25
* fix: reject native spec selection overrides by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/17
* fix: enforce preloaded VRT images and verified reaper reuse by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/26


**Full Changelog**: https://github.com/perplexityai/rules_web_e2e/compare/v2.0.0...v3.0.0

## 2.0.0 (2026-09-11)

## What's Changed
* docs: document public APIs and consumer setup by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/8
* feat: consume built browser specs and shells by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/11
* feat: support native Playwright configs and visual specs by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/13


**Full Changelog**: https://github.com/perplexityai/rules_web_e2e/compare/v1.0.0...v2.0.0

## 1.0.0 (2026-09-10)

## What's Changed
* feat: scaffold Bazel builds and BCR publishing by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/1
* docs: plan OSS browser testing APIs and delivery by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/2
* feat: add configurable Playwright visual regression tests by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/3
* feat: add Playwright E2E, remote endpoints, and component mounting by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/4
* feat: add first-class component browser tests by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/5
* feat: generate VRT captures from visual modules by @longlho in https://github.com/perplexityai/rules_web_e2e/pull/6

## New Contributors
* @longlho made their first contribution in https://github.com/perplexityai/rules_web_e2e/pull/1

**Full Changelog**: https://github.com/perplexityai/rules_web_e2e/commits/v1.0.0

## Changelog

Release notes are maintained by Release Please.
