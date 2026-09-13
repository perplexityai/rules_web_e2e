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
