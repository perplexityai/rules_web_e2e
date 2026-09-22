# React browser tests

A consumer-owned Vite build produces the app and gallery. Bazel compiles the
specs; the Linux amd64 presets supply the browser runtime and worker.
The local module override tests this checkout. Omit it in a project using the
released `rules_web_e2e` dependency.

## Preset path

From this directory, on a [KVM/vsock-capable Linux host](../../docs/worker-preset.md):

```sh
mkdir -p .web-e2e
bazel run --script_path="$PWD/.web-e2e/run" @rules_web_e2e//worker:runner
.web-e2e/run doctor
.web-e2e/run test //:e2e_test //:component_test //:native_config_test //:visual_test //:component_visual_test //:native_visual_test
.web-e2e/run run //:component_visual_test.update
```

Pass `--bazel=bazelisk` before the operation if needed. No `runtime.tar`, host
browser install, or handwritten remote-execution flags are required. Review
baseline changes after `.update`. Logs remain in `.web-e2e/logs/`.

## Host path

After [provisioning host Chromium](../../docs/host-browsers.md):

```sh
bazel test //:host_e2e_test //:host_component_test //:host_native_config_test //:remote_integration_test
```

Host targets omit `browser`. `remote_integration_test` owns a temporary external
server for `remote_test`; it exercises the existing-URL API. VRT requires an
isolated worker.

For custom runtime assembly, see [examples/browser-runtime](../browser-runtime)
and the [runtime guide](../../docs/browser-runtime.md).
