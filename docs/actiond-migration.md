# Actiond migration

VRT now runs through actiond Linux amd64 actions with caller-owned runtime files. Testcontainers, Ryuk, control relay, image manifests, and their
preload/patch dependencies removed. Host E2E/component tests retain host
Chromium and host networking.

Changes stacked as #27 (initial proof), #28 (declared runtime/actions),
and #29 (backend replacement).

## Validation

[Production VM run 34783532975](https://github.com/perplexityai/rules_web_e2e/actions/runs/34783532975)
passes native/component capture and comparison, local baseline updates, network
isolation, failed/empty captures, screenshot diffs, deadlines, cancellation, and
worker recovery. Native fixture launches real Bazel `js_binary` server.

Bazel 8.6/9.2 build/tests and host browser suites pass on Linux and macOS.
actual FormatJS editor gallery builds its Vite/StyleX assets, captures all eight
screenshots, applies references locally, and compares them in actiond process
isolation. See [consumer migration](host-browsers.md) for actual interface
and AGI wrapper requirements; this not claim that their full CI
migrations have landed.

## Caller changes

- Supply `browser` from declared `browser_runtime`; assemble pinned browser, Node, library,
  and font inputs with `browser_runtime_archive`.
- Configure pinned amd64 worker using [the execution guide](actiond.md).
  Set `target_platform` when native dependencies need additional ABI constraints.
- Keep compiled specs, built shells, matching, server data, and baseline ownership.
  `$(rootpath ...)` expands in explicit environment values, including JSON.
- Replace external VRT services with declared local fixtures. Live deployed
  checks stay in host E2E targets; inherited environment and origin exceptions
  do not carry over.

Pinned upstream actiond includes memory-advice syscalls. Browser actions now
request worker's glibc 2.39 and Bash runtime, and execute caller artifacts
without rewriting them. See [the ownership contract](actiond.md#declared-inputs-and-isolation).
Native macOS VM execution and cross-architecture
pixel equivalence remain unvalidated. These baselines require Linux amd64 worker.
