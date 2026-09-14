# Actiond migration

VRT now runs through actiond Linux amd64 actions with caller-owned runtime files
or OCI images. Testcontainers, Ryuk, the control relay, image manifests, and their
preload/patch dependencies are removed. Host E2E/component tests retain host
Chromium and host networking.

The changes are stacked as #27 (initial proof), #28 (declared runtime/actions),
and #29 (backend replacement).

## Validation

[Production VM run 34783532975](https://github.com/perplexityai/rules_web_e2e/actions/runs/34783532975)
passes native/component capture and comparison, local baseline updates, network
isolation, failed/empty captures, screenshot diffs, deadlines, cancellation, and
worker recovery. The native fixture launches a real Bazel `js_binary` server.

Bazel 8.6/9.2 build/tests and host browser suites pass on Linux and macOS. The
actual FormatJS editor gallery builds its Vite/StyleX assets, captures all eight
screenshots, applies references locally, and compares them in actiond process
isolation. See [consumer migration](host-browsers.md) for the actual interface
and the AGI wrapper requirements; this is not a claim that their full CI
migrations have landed.

## Caller changes

- Supply `browser` from a declared `browser_runtime`; move the former runtime
  `image` setting into the caller's OCI build and `browser_runtime_oci` target.
- Configure a patched amd64 worker using [the execution guide](actiond.md).
  Set `target_platform` when native dependencies need additional ABI constraints.
- Keep compiled specs, built shells, matching, server data, and baseline ownership.
  `$(rootpath ...)` expands in explicit environment values, including JSON.
- Replace external VRT services with declared local fixtures. Live deployed
  checks stay in host E2E targets; inherited environment and origin exceptions
  do not carry over.

The memory-advice patch is covered by upstream actiond PR #33. VRT now relocates
declared executable copies and no longer requires the rootfs patch in actiond
PR #49. Native macOS VM execution and cross-architecture
pixel equivalence remain unvalidated. These baselines require a Linux amd64 worker.
