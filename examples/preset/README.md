# Versioned Linux amd64 browser preset

This standalone module consumes `rules_web_e2e` through a local override only to
exercise the checkout in CI. A real consumer uses a released `bazel_dep` instead.
The `browsers.linux_amd64` declaration pins Chromium, Node, system libraries, and
fonts without copying their download definitions into the consumer's module.

```sh
bazel test //:runtime_test
```

The smoke test executes the declared Node and Chromium binaries through the
declared Linux loader with an empty PATH. The actiond integration suite also
uses this module's `:browser` target for real isolated browser and VRT tests.

In an application, pass `browser = "@web_browser//:browser"` to visual or isolated
interaction test targets and use Playwright 1.63.0. Supply your own compiled tests
and application assets. See [runtime setup](../../docs/browser-runtime.md) and
[worker preset](../../docs/worker-preset.md). This preset does not provision hardware
or grant tests network access.
