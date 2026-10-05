# Local Linux browser execution

Use `execution = "local"` with a declared Linux browser on `web_e2e_test`,
`component_browser_test`, `visual_test`, or `component_visual_test`:

```starlark
web_e2e_test(
    name = "browser_test",
    browser = "@web_browser//:browser",
    execution = "local",
    tests = ":specs",
    shell = ":app_shell",
)
```

Run with ordinary `bazel test`. Visual targets keep their `.update` command.
The default remains `execution = "actiond"`. Host browser tests without `browser`
keep their existing behavior. `host_vrt` cannot combine with local execution.

## Requirements

Linux x64 or ARM64 host, matching `target_arch`. Unprivileged user, mount, PID,
and network namespaces must be available. Chromium also uses a nested namespace
sandbox. No KVM, Docker daemon, system Chromium, or system Bubblewrap needed.

Use `linux_chromium_runtime` or an equivalent closed runtime directory containing
`bin/bash`, the matching loader under `lib/`, and `lib` in `library_dirs`.
Declare FFmpeg when recording video. Tests must serve their assets locally;
external APIs, DNS, and downloaded browser helpers are unavailable.

The launcher checks namespace creation and fails with setup guidance. It never
falls back to unrestricted host execution. On Ubuntu, an AppArmor policy can
block user namespaces even when the kernel supports them. Have the host operator
permit the Bazel-built runner under the organization's policy. CI enables user
namespaces only on its disposable hosted workers.

## What runs

Bazel builds static Bubblewrap from its registry module using the existing LLVM
musl toolchain. Bazel also declares each input mount and runfiles alias. The
launcher uses standard Bash runfiles and declared static lookup utilities.
It performs no recursive discovery, package repair, or runtime copying.

Bubblewrap creates an empty filesystem with read-only declared inputs, bundled
libraries and fonts, private `/proc`, minimal `/dev`, scratch, and writable test
outputs. Relative package symlinks retain their original layout. Fixture servers,
Playwright, Node, Chromium, and FFmpeg run together with loopback-only networking.
Chromium's own sandbox stays enabled by default. Bazel collects exit status,
JUnit, screenshots, diffs, traces, and videos as usual.

This controls browser userspace, not a whole OS. The host kernel, CPU, Bazel, and
initial host Bash remain environmental dependencies. The process environment is
cleared before entering the namespace. Processes use the built-in C locale and
UTC; Playwright `use.locale` controls the browser locale separately. Only declared test variables and relevant
Bazel run/shard metadata reach the test. This is a test execution contract, not
an audited boundary for hostile test code.

## Caching and lifecycle

Local tests have `external`/`no-cache` tags and run on every invocation. Captures
disable disk/remote spawn caching. Both reject remote execution. A fresh output
tree runs its own capture even when it shares a disk cache. Bazel may reuse an
unchanged capture within the same output tree; run `bazel clean` after changing
the host kernel or namespace policy. Do not move output trees between hosts.
Build inputs and the static runner remain normally cacheable. Shared browser
result caching needs an execution-platform identity covering kernel and policy.

Private PID namespaces and Bubblewrap's parent-death handling bound descendants
when Bazel cancels or times out. The existing runner watchdog also bounds stalled
capture jobs. Failed, empty, timed-out, and cancelled captures preserve source
baselines. Update commands apply successful captures only.

## Validation

The local regression driver reuses the actiond suite in a disposable consumer:

```sh
node e2e-tests/run.ts local /tmp/local-browser-validation
```

It covers E2E, components, native fixture servers, npm package dependencies,
network and filesystem isolation, bundled font selection, renderer seccomp,
video, missing FFmpeg, repeated runs, retries, VRT comparisons, diff/JUnit outputs,
timeouts, stalled runners, cancellation, and baseline preservation. Baseline files
created by the driver stay in the disposable consumer.

The `local Linux browsers` CI workflow runs on Ubuntu x64 and ARM64 with Bazel
8 and 9. The missing-library regression uses the same public backend and requires
startup failure instead of host fallback. Test artifacts include process mappings and browser traces.

For a syscall-level file-access audit on a development host with strace:

```sh
bazel test //:local_browser_test \
  --run_under='strace -ff -e trace=%file -o /tmp/browser-files'
```

Inspect successful opens after namespace entry, separately from the initial
host shell. Failed probes for host files are expected. Rendering determinism still
requires application control of time, random values, animations, and viewport.
