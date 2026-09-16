# VRT on actiond

`visual_test` and `component_visual_test` run the fixture server, Playwright,
Chromium, and screenshot comparison together in an isolated Linux amd64 action.
E2E and component tests also use this execution path when supplied a `browser`.
Callers supply a [declared browser runtime](browser-runtime.md), built from declared archives and files. Without `browser`, E2E and component tests use host browsers.

## Worker and Bazel configuration

Use actiond at commit [`4b767e8`](https://github.com/hermeticbuild/actiond/commit/4b767e852e21c5affa72ea7ebbf4d8a6e5d58136)
or newer, which enables memory-advice syscalls in both VM kernels.
The [integration suite](../tests/actiond/README.md) downloads this pinned source
archive through Bazel and builds the upstream workspace without local patches. VRT needs no runtime mounts. Ordinary native Bazel tests request actiond’s pinned
static Bash (`requires-bash`) for Bazel’s own test wrapper. Its remaining utilities
are [built from pinned sources](../internal/test_tools/README.md) with hermetic
LLVM and musl, supplied through `BASH_ENV`; no host packages or system libc are used. No `input-rootfs` or `libc` properties are needed.
Linux VM workers require KVM and vhost-vsock.

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
amd64 worker. For local Apple Silicon execution, see the experimental
[macOS ARM64 VRT guide](macos-arm64-vrt.md). The validated CI worker uses 6 GiB RAM for at most two
concurrent actions; size workers for fixture and staging memory as well as
Chromium. The macOS native VM backend is not yet validated by these
checks. Keep VRT's explicit remote strategies and local fallback disabled.
The bootstrap also rejects ordinary host roots with system shell/loader paths
before creating temporary runtime launchers.

```sh
bazel test --config=vrt //path:visual_test
bazel run --config=vrt //path:visual_test.update
```

Ordinary browser tests are native Bazel test actions. Bazel owns their exit
status, retries, repeated runs, and test-result caching. `--nocache_test_results`
reruns Chromium; failure reports are standard test artifacts.

VRT comparison and capture are cacheable build actions. Their result directory
contains test status and artifacts even when the suite fails. A local test
wrapper reports comparison failure, copies reports into Bazel test outputs, and
forwards per-case JUnit to Bazel’s XML output for failure/quarantine matching.
The local update wrapper applies successful, nonempty captures to the source
baseline directory. Failed, timed-out, and empty captures preserve references.
A cancelled build never runs the local update wrapper.

## Declared inputs and isolation

The runtime tree contains Node, Chromium, loaders, libraries, fonts, and shell
commands needed by fixtures. Bazel downloads checksum-pinned packages and browser
archives before execution; assembly never contacts the network.
Docker, registry credentials, Testcontainers, and Ryuk are absent from the action.

The declared ELF loader starts the bootstrap. It prepares a private Node/Bash
launcher in the action's temporary directory, then relocates executable copies
in the staged inputs. Libraries and fonts use explicit paths. An isolated-browser Node
preload directs `spawn(..., {shell: true})` to declared Bash, preserving native
Playwright `webServer` behavior without `/bin/sh`. Host tests do not load it.

The action has loopback-only networking. Start fixture services inside it using
`server` or native Playwright `webServer`, and declare their files in `data`.
External assets and APIs need local fixtures. Live deployed checks belong in
host E2E targets. Explicit `env` is supported, including `$(rootpath ...)` inside
JSON strings; inherited environment and network origin exceptions are rejected.

Pin the runtime packages, architecture, browser/client versions, fonts, fixtures,
locale, and timezone. This makes rendering inputs controlled; tests must still
control time, randomness, animations, and their own application state. The VM
provides isolation, not a claim that arbitrary screenshot tests are deterministic.
