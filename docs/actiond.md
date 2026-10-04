# Manual actiond setup

By default, `visual_test` and `component_visual_test` run the fixture server,
Playwright, Chromium, and screenshot comparison together in an isolated Linux amd64 action.
E2E and component tests also use this execution path when supplied a `browser`.
Callers supply a [declared browser runtime](browser-runtime.md), built from declared archives and files. Without `browser`, E2E and component tests use host browsers.

For the supported Linux amd64 path, use the [worker preset](worker-preset.md).
It downloads the compatible worker, generates execution settings, and supervises
startup and cleanup for a local command or CI bucket. The manual configuration
below remains available for custom worker operators.

## Worker and Bazel configuration

Pin a compatible actiond worker. The preset uses release **0.0.7** (source
[`4b767e8`](https://github.com/hermeticbuild/actiond/commit/4b767e852e21c5affa72ea7ebbf4d8a6e5d58136)),
including its VM kernel. Linux workers require KVM and vhost-vsock.
Browser actions request `libc=glibc2.39` and `requires-bash`. The worker supplies
standard ELF interpreter paths and its pinned libc; browser-specific libraries
and fonts remain declared inputs. Native Bazel tests also use the rules'
[hermetic launcher utilities](../internal/test_tools/README.md).

With a pinned worker listening on `127.0.0.1:8980`, put this in the consumer's
Bazel configuration:

```text
build:vrt --jobs=2
build:vrt --remote_executor=grpc://127.0.0.1:8980
build:vrt --remote_cache=grpc://127.0.0.1:8980
build:vrt --spawn_strategy=sandboxed,local
build:vrt --strategy=VrtCapture=remote
build:vrt --strategy=VrtCompare=remote
build:vrt --strategy=TestRunner=remote,local
build:vrt --remote_local_fallback=false
build:vrt --remote_upload_local_results=false
build:vrt --noremote_cache_compression
build:vrt --remote_download_outputs=all
build:vrt --extra_execution_platforms=@platforms//host:host,@rules_web_e2e//internal:linux_amd64
```

Include the worker binary SHA256 in the execution platform properties, for example
`--remote_default_exec_properties=actiond-worker-sha256=WORKER_SHA256`. Change it
when the worker or embedded kernel changes; otherwise previous action results can
be reused across execution environments. The worker operator owns this identity.

Use a remote worker address when appropriate. Existing amd64 baselines use an
amd64 worker. For validated local Apple Silicon execution, see the
[macOS ARM64 VRT guide](macos-arm64-vrt.md). The validated CI worker uses 6 GiB RAM for at most two
concurrent actions; size workers for fixture memory as well as
Chromium. The macOS native VM backend passed the local ARM64 VRT suite;
CI still uses Linux amd64. Keep VRT's explicit remote strategies and local fallback disabled.
The bootstrap also rejects ordinary host roots containing `/bin/sh`; the pinned
worker supplies `/bin/bash` but no `/bin/sh`. This check is specific to worker
0.0.7. Changing workers requires revalidating the execution contract.

```sh
bazel test --config=vrt //path:visual_test
bazel run --config=vrt //path:visual_test.update
```

Ordinary browser tests are native Bazel test actions. Bazel owns their exit
status, retries, repeated runs, and test-result caching. `--nocache_test_results`
reruns Chromium; failure reports are standard test artifacts.

Linux amd64 VRT comparisons also use native Bazel test actions. Retries and
`--runs_per_test` launch fresh browser executions; `--nocache_test_results`
reruns comparison even when all build inputs are unchanged. Failed comparisons
publish screenshots and per-case JUnit through Bazel test outputs and XML.
ARM64 still uses a comparison build action and a local result test until its
native launcher tools are available.

VRT capture remains a cacheable build action. Its result directory contains
status and artifacts even when capture fails.
The local update wrapper applies successful, nonempty captures to the source
baseline directory. Failed, timed-out, and empty captures preserve references.
A cancelled build never runs the local update wrapper.

## Declared inputs and isolation

The runtime tree contains Node, Chromium, loaders, libraries, fonts, and shell
commands needed by fixtures. Bazel downloads checksum-pinned packages and browser
archives before execution; assembly never contacts the network.
Docker, registry credentials, Testcontainers, and Ryuk are absent from the action.

The caller owns compilation, typechecking, bundling, executable permissions, and
its complete dependency layout. Native tests use Bazel's runfile tree directly.
VRT build actions map logical runfile names to declared artifacts with symlinks;
they do not copy packages, repair npm links, scan executables, or rewrite ELF
interpreters and shebangs. Missing required dependencies fail at the caller's
import or launch. Unused platform artifacts are not inspected.

Node and Chromium run unchanged using the worker's glibc 2.39. Worker libc paths
precede caller library paths so the loader and libc remain paired. Executables
must target this Linux ABI. The current worker's `/usr/bin/env` supports only
`bash` and `sh`, and `/bin/sh` is absent: use `/bin/bash` or explicit declared
executables. A TypeScript preload adapts Node's `spawn(..., {shell: true})` to
`/bin/bash` for Playwright `webServer`. It does not rewrite caller files. Removing
this adapter requires an upstream worker with standard shell/env support.

Generated Playwright configuration, caches, and working snapshots live in private
scratch directories. An explicit `playwright_runtime` must reference the same
physical test/core packages used by the caller's specs and config. When omitted,
the runner selects the package resolved by the first spec/config and checks that
all modules agree. It never replaces a dependency to force agreement.

The action has loopback-only networking. Start fixture services inside it using
`server` or native Playwright `webServer`, and declare their files in `data`.
External assets and APIs need local fixtures. Live deployed checks belong in
host E2E targets. Explicit `env` is supported, including `$(rootpath ...)` inside
JSON strings; inherited environment and network origin exceptions are rejected.

Pin the runtime packages, architecture, browser/client versions, fonts, fixtures,
locale, and timezone. This makes rendering inputs controlled; tests must still
control time, randomness, animations, and their own application state. The VM
provides isolation, not a claim that arbitrary screenshot tests are deterministic.
