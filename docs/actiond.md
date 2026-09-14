# VRT on actiond

`visual_test` and `component_visual_test` run the fixture server, Playwright,
Chromium, and screenshot comparison together in an isolated Linux amd64 action.
Callers supply a [declared browser runtime](browser-runtime.md), built from declared archives and files. Host E2E and component tests use host browsers.

## Worker and Bazel configuration

Use actiond at commit [`4b767e8`](https://github.com/hermeticbuild/actiond/commit/4b767e852e21c5affa72ea7ebbf4d8a6e5d58136)
or newer, which enables memory-advice syscalls in both VM kernels.
The production workflow builds this pinned upstream revision without local patches. No `input-rootfs`,
`libc`, or `requires-bash` execution properties are needed.
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
checks. Keep VRT's explicit remote strategies and local fallback disabled.
The bootstrap also rejects ordinary host roots with system shell/loader paths
before creating temporary runtime launchers.

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
commands needed by fixtures. Bazel downloads checksum-pinned packages and browser
archives before execution; assembly never contacts the network.
Docker, registry credentials, Testcontainers, and Ryuk are absent from the action.

The declared ELF loader starts the bootstrap. It prepares a private Node/Bash
launcher in the action's temporary directory, then relocates executable copies
in the staged inputs. Libraries and fonts use explicit paths. A VRT-only Node
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
