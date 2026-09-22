# rules_web_e2e

Bazel rules for Playwright E2E, component interactions, and visual regression
tests (VRT). Bring compiled specs and a built app; the rules manage test
execution, reports, and screenshot updates.

## Choose a setup

| Path | Use it for | You configure |
| --- | --- | --- |
| **Basic: presets** | Isolated Linux amd64 tests | One browser release and the worker launcher |
| **Advanced: custom** | Custom browsers, fonts, ARM64, or worker infrastructure | Runtime inputs and/or worker execution settings |
| **Host tests** | Live services or E2E/component tests without a VM | A version-matched host Playwright browser; no VRT |

The preset supplies Chromium, Node, libraries, and fonts. Its worker supervisor
handles download, startup, execution flags, logs, and cleanup. You still own
app/spec builds, matching Playwright packages, and a Linux runner with KVM/vsock.
Runtime and worker customization are independent.

Start with [Getting started](docs/getting-started.md) or the runnable
[React example](examples/react/README.md).

## API

```starlark
load("@rules_web_e2e//component:defs.bzl", "browser_shell", "component_browser_test")
load("@rules_web_e2e//e2e:defs.bzl", "web_e2e_test")
load("@rules_web_e2e//vrt:defs.bzl", "component_visual_test")

browser_shell(name = "gallery", assets = ":built_gallery", entry_point = "gallery.html")

web_e2e_test(
    name = "e2e_test",
    browser = "@web_browser//:browser",
    tests = ":compiled_specs",
    server = ":compiled_server",
)

component_browser_test(
    name = "component_test",
    browser = "@web_browser//:browser",
    tests = ":compiled_component_specs",
    shell = ":gallery",
)

component_visual_test(
    name = "visual_test",
    browser = "@web_browser//:browser",
    shell = ":gallery",
    baselines = glob(["__screenshots__/*.png"], allow_empty = True),
)
```

Use `visual_test(tests = ":compiled_specs", ...)` for native Playwright
`toHaveScreenshot` assertions. Gallery VRT generates captures from registered
`.visual.tsx` modules. Each visual target owns its baseline directory and an
explicit `.update` target; review PNG changes before committing.

See the [API reference](docs/api.md), [documentation index](docs/README.md),
and [development guide](docs/development.md).
