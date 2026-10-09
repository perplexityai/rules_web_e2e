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

The rule selects compiled specs from each suite and includes their dependencies
and explicit data. Duplicate specs appear once. At launch, it writes a temporary
aggregate config that discovers exactly those specs. Source maps and original
source inputs are retained for debugging. Temporary configuration is removed
when Playwright exits. The UI process runs until closed and receives terminal
interrupts; it has no suite execution timer.

Supply one aggregate compiled config, including browser settings and a shared
`webServer` if needed. Individual suite configs and environment variables are
not combined: per-suite servers often have conflicting ports or setup hooks.
Relative web-server commands retain the aggregate config's directory as their
working directory. Declare extra server dependencies in `data` and values in
`env`; the developer executable also inherits its invoking environment.
Specs and config must resolve the same `@playwright/test` instance as the declared
runtime, matching the regular test rule's package contract.

Compiled mode displays the emitted JavaScript executed by CI. Watching workspace
TypeScript does not rebuild Bazel outputs automatically. Rebuild/relaunch after
source edits, or use source mode for the live edit/watch workflow.

## Workspace source mode

```starlark
web_e2e_ui(
    name = "e2e_ui_source",
    suites = [":e2e_tests"],
    mode = "source",
    source_config = "playwright.source.config.ts",
)
```

Source mode runs the caller's original config from `BUILD_WORKSPACE_DIRECTORY`.
That config owns source test discovery, TypeScript aliases, server startup, and
watch behavior. Configure it to discover the same feature specs selected by the
suite list. It uses the workspace's installed `@playwright/test`, so run the
workspace package-manager setup first. It inherits the developer's environment
and browser installation. It deliberately runs outside hermetic test actions;
source discovery is not constrained to the compiled suite selection.

Both modes currently support managed-server E2E suites. Component, visual, and
process-owned suites require different runtime contracts and are rejected.
