# Aggregate Playwright UI

`web_e2e_ui` launches a local Playwright UI session over existing `web_e2e_test`
targets, directly or through nested Bazel `test_suite` targets. It is a developer
executable, with no test-result caching, CI deadline, or remote browser worker.
Suite compilation remains separate and reusable.

```starlark
load("@rules_web_e2e//e2e:defs.bzl", "web_e2e_ui")

test_suite(
    name = "e2e_tests",
    tests = ["//e2e/auth:tests", "//e2e/billing:tests"],
)

web_e2e_ui(
    name = "e2e_ui",
    suites = [":e2e_tests"],
    config = ":compiled_ui_config",
    playwright = ":playwright_runtime",
    env = {"APP_PORT": "1234"},
)
```

```bash
bazel run //e2e:e2e_ui
bazel run //e2e:e2e_ui -- --ui-host=127.0.0.1 --ui-port=8080
bazel run //e2e:e2e_ui -- --list
```

Reuse the existing CI `test_suite` so adding a feature target updates both CI and
UI without maintaining a second list. Suite traversal follows explicit `tests`
entries recursively; specify those entries rather than relying on implicit
package-wide test discovery. Bazel `test_suite` tag filtering is not applied by
UI aggregation: every explicitly listed managed E2E target is selected.

Bazel selects and deduplicates compiled specs during analysis. Declared actions
build an immutable directory artifact containing the aggregate config and import
modules for exactly those specs. A generated `js_binary` entry point starts the
declared Playwright CLI directly with Bazel's Node toolchain. No session-time
config generation, temporary spec copies, or workspace package-manager lookup.

The UI watches only the bundle's spec directory. It cannot recursively watch
neighboring Bazel outputs and runfiles, which exhausted macOS file descriptors
and caused `spawn EBADF` when workers started. Specs execute at their original
compiled locations, retaining relative imports, source maps, and debugger inputs.

Test artifacts use the caller's configured output directory or default to
`test-results/<package>/<target>` under the workspace. Bazel tests use their
output/temp directory instead. The bundle itself is never modified by the UI.

Supply one aggregate compiled config, including browser settings and a shared
`webServer` if needed. Individual suite configs and environment variables are
not combined: per-suite servers often have conflicting ports or setup hooks.
Relative web-server commands retain the aggregate config's directory as their
working directory. Declare extra server dependencies in `data` and values in
`env`; the developer executable also inherits its invoking environment.
Specs and config must resolve the same `@playwright/test` instance as the declared
runtime, matching the regular test rule's package contract.

The UI displays the emitted JavaScript executed by CI. Rebuild/relaunch after
TypeScript edits. `mode = "source"` and `source_config` are no longer supported;
this rule uses declared compiled suites and the declared Playwright runtime only.

Managed-server E2E suites are supported. Component, visual, and process-owned
suites require different runtime contracts and are rejected.

On Linux without `DISPLAY` or `WAYLAND_DISPLAY`, the launcher serves the UI on
loopback and prints its URL instead of opening a headed browser. Forward that
port from your devbox and open it locally. Explicit `--ui-host` and `--ui-port`
options override the default.
