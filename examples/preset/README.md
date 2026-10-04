# Versioned Linux amd64 browser preset

This standalone module consumes `rules_web_e2e` through local override only to
exercise checkout in CI. Real consumer uses released `bazel_dep` instead.
`browsers.linux_amd64` declaration pins Chromium, Node, system libraries, and
fonts without copying their download definitions into consumer's module.

```sh
bazel test //:runtime_test
```

Smoke test executes declared Node and Chromium binaries through
declared Linux loader with empty PATH. Actiond integration suite also
uses this module's `:browser` target for real isolated browser and VRT tests.

In application, pass `browser = "@web_browser//:browser"` to visual or isolated
interaction test targets and use Playwright 1.63.0. Supply your own compiled tests
and application assets. See [runtime setup](../../docs/browser-runtime.md) and
[worker preset](../../docs/worker-preset.md). This preset does not provision hardware
or grant tests network access.
