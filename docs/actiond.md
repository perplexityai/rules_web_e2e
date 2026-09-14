# VRT on actiond

`visual_test` and `component_visual_test` run the fixture server, Playwright,
Chromium, and screenshot comparison together in an isolated Linux amd64 action.
Callers supply a [declared browser runtime](browser-runtime.md), optionally built
from their own OCI image. Host E2E and component tests use host browsers.

## Worker and Bazel configuration

The worker currently needs the memory-advice and declared-rootfs patches in
[`experiments/actiond`](../experiments/actiond). The memory-advice change is
[upstream PR #48](https://github.com/hermeticbuild/actiond/pull/48); the rootfs
patch is maintained locally for upstreaming. The production workflow builds and
runs that exact patched worker. Linux VM workers require KVM and vhost-vsock.

With a patched worker listening on `127.0.0.1:8980`, put this in the consumer's
Bazel configuration:

```text
build:vrt --jobs=2
build:vrt --remote_executor=grpc://127.0.0.1:8980
build:vrt --remote_cache=grpc://127.0.0.1:8980
build:vrt --spawn_strategy=sandboxed,local
build:vrt --strategy=VrtCapture=remote
build:vrt --strategy=VrtCompare=remote
build:vrt --remote_local_fallback=false
build:vrt --remote_upload_local_results=false
build:vrt --noremote_cache_compression
build:vrt --remote_download_outputs=all
build:vrt --extra_execution_platforms=@platforms//host:host,@rules_web_e2e//internal:linux_amd64
```

Use a remote worker address when appropriate. ARM64 clients need an amd64 worker
for these baselines. The validated CI worker uses 6 GiB RAM for at most two
concurrent actions; size workers for fixture and staging memory as well as
Chromium. The macOS native VM backend is not yet validated by these
checks. Local fallback must remain disabled; `/workspace` runtime executables
are meaningful inside the worker's declared rootfs.

```sh
bazel test --config=vrt //path:visual_test
bazel run --config=vrt //path:visual_test.update
```

Comparison and capture are cacheable build actions. Their result directory
contains test status and artifacts even when the suite fails. A local test
wrapper reports comparison failure and copies reports into Bazel test outputs.
The local update wrapper applies successful, nonempty captures to the source
baseline directory. Failed, timed-out, and empty captures preserve references.
A cancelled build never runs the local update wrapper.

## Declared inputs and isolation

The runtime tree contains Node, Chromium, loaders, libraries, fonts, and shell
commands needed by fixtures. OCI extraction verifies declared blobs and never
contacts a registry. Acquisition and image construction happen before execution;
Docker, registry credentials, Testcontainers, and Ryuk are absent from the action.

The action has loopback-only networking. Start fixture services inside it using
`server` or native Playwright `webServer`, and declare their files in `data`.
External assets and APIs need local fixtures. Live deployed checks belong in
host E2E targets. Explicit `env` is supported, including `$(rootpath ...)` inside
JSON strings; inherited environment and network origin exceptions are rejected.

Pin the runtime image, architecture, browser/client versions, fonts, fixtures,
locale, and timezone. This makes rendering inputs controlled; tests must still
control time, randomness, animations, and their own application state. The VM
provides isolation, not a claim that arbitrary screenshot tests are deterministic.
