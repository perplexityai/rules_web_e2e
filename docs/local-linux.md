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
cleared before entering the namespace. UID/GID are 1000 and hostname is
`bazel-browser`, independent of the host user. Declared hosts and NSS files resolve
`localhost` and `bazel-browser` to loopback without host DNS. Processes use the built-in C locale
and UTC; Playwright `use.locale` controls the browser locale separately. Only
declared test variables and relevant Bazel run/shard metadata reach the test. This is a test execution contract, not
an audited boundary for hostile test code.

## Caching and lifecycle

Local execution defaults to uncached browser results. For deterministic suites on
a controlled CI worker pool, enable caching:

```starlark
visual_test(
    name = "visuals",
    browser = "@web_browser//:browser",
    execution = "local",
    cacheable = True,
    exec_properties = {"web-e2e-local-platform": "ci-image-v7-kernel6.8-zen4-userns-v1"},
    tests = ":compiled_visual_specs",
    config = ":config",
    baseline_dir = "__screenshots__",
    baselines = glob(["__screenshots__/*.png"]),
)
```

Use the same environment identity only for equivalent runner images, kernels,
CPU classes, and namespace policies. CI owns that assertion; this value does not
select or provision a machine. A label like `ubuntu-latest` is too broad. Our CI
hashes its image version, kernel, CPU characteristics, and namespace policy.

Bazel caches passing tests and capture artifacts in its normal disk/remote cache.
`no-remote-exec` keeps browser execution local while allowing remote cache hits.
The properties are also declared job inputs, so changing the identity invalidates
both local and shared results. Browser, font, fixture, environment, and baseline
changes remain ordinary declared-input changes. A cache hit skips execution and
restores reports; the namespace preflight runs only on a miss.

Use `--nocache_test_results` for fresh test runs. Default uncached tests retain
`external`/`no-cache` behavior; default captures reject shared caches but may be
reused within one output tree. Do not move output trees across hosts. Build inputs
and the static runner stay cacheable in either mode. Use standard Bazel cache
configuration; there is no separate browser cache.

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
timeouts, stalled runners, cancellation, and baseline preservation. Cache probes
check fresh-output-tree hits, environment/input invalidation, changed baselines,
and explicit reruns. Baseline files
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
