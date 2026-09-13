# Changelog

## Unreleased

### Breaking compatibility: host browser execution

`web_e2e_test` and `component_browser_test` now launch on the host. Provision a
version-matched browser and supply `PLAYWRIGHT_BROWSERS_PATH` before upgrading.
Remove their `network_origins`, `network_origins_env`, and `use.connectOptions`;
host browsers use host networking. Only VRT retains Testcontainers and image
requirements. See [migration guidance for AGI and FormatJS](docs/host-browsers.md).

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
