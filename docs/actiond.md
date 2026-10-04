# Manual actiond setup

By default, `visual_test` and `component_visual_test` run fixture server,
Playwright, Chromium, and screenshot comparison together in isolated Linux amd64 action.
E2E and component tests also use this execution path when supplied `browser`.
Callers supply [declared browser runtime](browser-runtime.md), built from declared archives and files. Without `browser`, E2E and component tests use host browsers.

For supported Linux amd64 path, use [worker preset](worker-preset.md).
It downloads compatible worker, generates execution settings, and supervises
startup and cleanup for local command or CI bucket. Manual configuration
below remains available for custom worker operators.

## Worker and Bazel configuration

Pin compatible actiond worker. Preset uses release **0.0.7** (source
[`4b767e8`](https://github.com/hermeticbuild/actiond/commit/4b767e852e21c5affa72ea7ebbf4d8a6e5d58136)),
including its VM kernel. Linux workers require KVM and vhost-vsock.
Browser actions request `libc=glibc2.39` and `requires-bash`. Worker supplies
standard ELF interpreter paths and its pinned libc; browser-specific libraries
and fonts remain declared inputs. Native Bazel tests also use rules'
[hermetic launcher utilities](../internal/test_tools/README.md).

With pinned worker listening on `127.0.0.1:8980`, put this in consumer's
Bazel configuration:

```text
build:vrt --jobs=2
build:vrt --remote_executor=grpc://127.0.0.1:8980
build:vrt --remote_cache=grpc://127.0.0.1:8980
build:vrt --spawn_strategy=sandboxed,local
build:vrt --strategy=VrtCapture=remote
build:vrt --strategy=TestRunner=remote,local
build:vrt --remote_local_fallback=false
build:vrt --remote_upload_local_results=false
build:vrt --noremote_cache_compression
build:vrt --remote_download_outputs=all
build:vrt --extra_execution_platforms=@platforms//host:host,@rules_web_e2e//internal:linux_amd64
```

Include worker binary SHA256 in execution platform properties, for example
`--remote_default_exec_properties=actiond-worker-sha256=WORKER_SHA256`. Change it
when worker or embedded kernel changes; otherwise previous action results can
be reused across execution environments. Worker operator owns this identity.

Use remote worker address when appropriate. Existing amd64 baselines use
amd64 worker. For validated local Apple Silicon execution, see
[macOS ARM64 VRT guide](macos-arm64-vrt.md). Validated CI worker uses 6 GiB RAM for at most two
concurrent actions; size workers for fixture memory as well as
Chromium. MacOS native VM backend passed local ARM64 VRT suite;
CI still uses Linux amd64. Keep VRT's explicit remote strategies and local fallback disabled.
Bootstrap also rejects ordinary host roots containing `/bin/sh`; pinned
worker supplies `/bin/bash` but no `/bin/sh`. This check specific to worker
0.0.7. Changing workers requires revalidating execution contract.

```sh
bazel test --config=vrt //path:visual_test
bazel run --config=vrt //path:visual_test.update
```

Ordinary browser tests native Bazel test actions. Bazel owns their exit
status, retries, repeated runs, and test-result caching. `--nocache_test_results`
reruns Chromium; failure reports standard test artifacts.

Linux amd64 and ARM64 VRT comparisons use native Bazel test actions. Retries and
`--runs_per_test` launch fresh browser executions; `--nocache_test_results`
reruns comparison even when all build inputs unchanged. Failed comparisons
publish screenshots and per-case JUnit through Bazel test outputs and XML.

VRT capture remains cacheable build action. Its result directory contains
status and artifacts even when capture fails.
Local update wrapper applies successful, nonempty captures to source
baseline directory. Failed, timed-out, and empty captures preserve references.
Cancelled build never runs local update wrapper.

## Declared inputs and isolation

Runtime tree contains Node, Chromium, loaders, libraries, fonts, and shell
commands needed by fixtures. Bazel downloads checksum-pinned packages and browser
archives before execution; assembly never contacts network.
Docker, registry credentials, Testcontainers, and Ryuk absent from action.

Caller owns compilation, typechecking, bundling, executable permissions, and
its complete dependency layout. Native tests and VRT build actions use Bazel's
runfile trees. Build actions invoke declared launchers through `FilesToRunProvider`;
Bazel prepares their runfiles. Runtime does not copy packages, repair npm links,
scan executables, or rewrite ELF
interpreters and shebangs. Missing required dependencies fail at caller's
import or launch. Unused platform artifacts not inspected.

Node and Chromium run unchanged using worker's glibc 2.39. Worker libc paths
precede caller library paths so loader and libc remain paired. Executables
must target this Linux ABI. Current worker's `/usr/bin/env` supports only
`bash` and `sh`, and `/bin/sh` absent: use `/bin/bash` or explicit declared
executables. TypeScript preload adapts Node's `spawn(..., {shell: true})` to
`/bin/bash` for Playwright `webServer`. It does not rewrite caller files. Removing
this adapter requires upstream worker with standard shell/env support.

Generated Playwright configuration, caches, and working snapshots live in private
scratch directories. Explicit `playwright_runtime` must reference same
physical test/core packages used by caller's specs and config. When omitted,
runner selects package resolved by first spec/config and checks that
all modules agree. It never replaces dependency to force agreement.

Action has loopback-only networking. Start fixture services inside it using
`server` or native Playwright `webServer`, and declare their files in `data`.
External assets and APIs need local fixtures. Live deployed checks belong in
host E2E targets. Explicit `env` supported, including `$(rootpath ...)` inside
JSON strings; inherited environment and network origin exceptions rejected.

Pin runtime packages, architecture, browser/client versions, fonts, fixtures,
locale, and timezone. This makes rendering inputs controlled; tests must still
control time, randomness, animations, and their own application state. VM
provides isolation, not claim that arbitrary screenshot tests deterministic.
