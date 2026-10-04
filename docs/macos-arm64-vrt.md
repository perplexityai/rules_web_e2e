# Local VRT on Apple Silicon

ARM64 VRT path uses Bazel on macOS and actiond's local Linux ARM64 VM.
Chromium, Node, libraries, fonts, and fixture inputs declared files. No Docker
or OCI extraction involved. Same remote capture/comparison protocol
used as on amd64; `remote` here points to worker on localhost.

Validated on Apple Silicon with macOS 26.6.2 on 2026-09-16. Signed upstream
worker booted its Linux ARM64 VM and passed complete VRT integration suite:
native and gallery capture/comparison, network isolation, empty/failed update
protection, deadlines, screenshot diffs, cancellation, and worker reuse afterward.
Repository checks passed 22 test targets; Linux x64 utilities test was skipped
as intended. Linux validation previously passed all 23 targets.

Validated worker used actiond `4b767e8`, without patches, with SHA256
`9a4a666543311a5ebc6e894b9157ae8e1cf0e72df21c522b966c3c2d35320a05`.
This verifies local ARM64 VRT; pixel equivalence with amd64 remains unverified.

MacOS GitHub Actions workflow builds ARM64 runtime, signed worker, and
native/gallery capture and comparison inputs on every PR. GitHub-hosted Macs
[do not support nested virtualization](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
so this build smoke check. Running VM suite in CI requires physical
Apple Silicon runner. Reproduce hosted check with script's `--build-only`
option.

## Run the integration suite

Install Xcode command-line tools, Bazelisk, Node.js 24+, and Python 3. From
repository root:

```sh
bash e2e-tests/actiond/run-macos-arm64.sh /tmp/rules-web-vrt-arm64
```

Use dedicated work directory without spaces. Script downloads pinned
upstream actiond source through Bazel, builds its signed macOS executable,
assembles checksum-pinned Linux ARM64 browser runtime, starts 6 GiB / 2 CPU
VM on port 8980, and runs VRT integration cases. Port 8980 must be free.
Worker stops when script exits. Downloads need network access during
setup; screenshot actions have only loopback networking.

Suite checks native screenshot specs, component galleries, network isolation,
empty/failed updates, screenshot diffs, deadlines, and cancellation. It writes
baselines into temporary example checkout under `WORK/public`, leaving
repository's baselines untouched. Logs `WORK/worker-build.log`, `WORK/vm.log`,
and `WORK/results/`. Ordinary isolated E2E/component tests not included in
this ARM64 lane; their native test-launcher tools currently target amd64.

Worker source pinned in `MODULE.bazel` to actiond `4b767e8`. This already
includes memory-advice kernel fix required by Node/V8. No additional upstream
patch included. Upstream macOS target supplies virtualization signing
entitlement. No additional upstream fixes were needed for Mac validation.

## Use it in a consumer

Produce ARM64 runtime with `linux_chromium_runtime(arch = "arm64", ...)`, using
matching Linux ARM64 Chromium and Node archives. Its default system preset
`@rules_web_e2e//playwright/presets:noble_20260901_arm64`. See
`examples/browser-runtime:browser_arm64` for exact archive URLs and checksums.
To build that runtime directly:

```sh
cd examples/browser-runtime
bazelisk build //:browser_arm64
```

For custom `browser_runtime`, set `arch = "arm64"` and appropriate loader
(e.g. `loader = "lib/ld-linux-aarch64.so.1"`). On each VRT target set:

```starlark
component_visual_test(
    name = "visuals_arm64",
    browser = ":arm64_browser",
    target_arch = "arm64",
    shell = ":gallery",
    matching = ":matching",
    baseline_dir = "__screenshots_arm64__",
    baselines = glob(["__screenshots_arm64__/*.png"], allow_empty = True),
)
```

`target_arch` defaults to `x64` for existing callers. ARM64 chooses built-in
Linux ARM64 target platform and requires Linux ARM64 execution platform.
custom `target_platform` must match runtime's CPU and Linux OS. Mixing
architectures fails during analysis rather than executing wrong binaries.

Use [actiond configuration](actiond.md), replacing its execution platforms
line with:

```text
build:vrt --extra_execution_platforms=@platforms//host:host,@rules_web_e2e//internal:linux_arm64
```

Add `bazel_dep(name = "platforms", version = "1.1.0")` to consumer MODULE
if it does not already declare `platforms`. Keep host platform first, so ordinary build tools execute on Mac. Do not
set entire build's `--platforms` to Linux; rule transitions fixture
inputs while keeping result application local. Keep remote fallback disabled.
Start worker built by integration script in another terminal:

```sh
/tmp/rules-web-vrt-arm64/actiond-worker serve-vm \
  --root=/tmp/rules-web-vrt-arm64/vm --listen=127.0.0.1:8980 \
  --memory-mib=6144 --cpus=2 --cas-image-size-mib=4096
```

Supply worker SHA256 as described in execution guide. Then use usual
`bazelisk test --config=vrt //:visuals_arm64` and
`bazelisk run --config=vrt //:visuals_arm64.update` commands.

ARM64 rendering not assumed pixel-identical to amd64. Review first ARM64
captures and use separate baseline directories until equivalence established.
