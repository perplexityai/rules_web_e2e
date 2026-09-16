# Local VRT on Apple Silicon

The ARM64 VRT path uses Bazel on macOS and actiond's local Linux ARM64 VM.
Chromium, Node, libraries, fonts, and fixture inputs are declared files. No Docker
or OCI extraction is involved. The same remote capture/comparison protocol is
used as on amd64; `remote` here points to a worker on localhost.

Validated on Apple Silicon with macOS 26.6.2 on 2026-09-16. The signed upstream
worker booted its Linux ARM64 VM and passed the complete VRT integration suite:
native and gallery capture/comparison, network isolation, empty/failed update
protection, deadlines, screenshot diffs, cancellation, and worker reuse afterward.
Repository checks passed 22 test targets; the Linux x64 utilities test was skipped
as intended. Linux validation previously passed all 23 targets.

The validated worker used actiond `4b767e8`, without patches, with SHA256
`9a4a666543311a5ebc6e894b9157ae8e1cf0e72df21c522b966c3c2d35320a05`.
This verifies local ARM64 VRT; pixel equivalence with amd64 remains unverified.

The macOS GitHub Actions workflow builds the ARM64 runtime, signed worker, and
native/gallery capture and comparison inputs on every PR. GitHub-hosted Macs
[do not support nested virtualization](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
so this is a build smoke check. Running the VM suite in CI requires a physical
Apple Silicon runner. Reproduce the hosted check with the script's `--build-only`
option.

## Run the integration suite

Install Xcode command-line tools, Bazelisk, Node.js 24+, and Python 3. From the
repository root:

```sh
bash tests/actiond/run-macos-arm64.sh /tmp/rules-web-vrt-arm64
```

Use a dedicated work directory without spaces. The script downloads the pinned
upstream actiond source through Bazel, builds its signed macOS executable,
assembles a checksum-pinned Linux ARM64 browser runtime, starts a 6 GiB / 2 CPU
VM on port 8980, and runs the VRT integration cases. Port 8980 must be free.
The worker stops when the script exits. Downloads need network access during
setup; screenshot actions have only loopback networking.

The suite checks native screenshot specs, component galleries, network isolation,
empty/failed updates, screenshot diffs, deadlines, and cancellation. It writes
baselines into a temporary example checkout under `WORK/public`, leaving the
repository's baselines untouched. Logs are `WORK/worker-build.log`, `WORK/vm.log`,
and `WORK/results/`. Ordinary isolated E2E/component tests are not included in
this ARM64 lane; their native test-launcher tools currently target amd64.

The worker source is pinned in `MODULE.bazel` to actiond `4b767e8`. This already
includes the memory-advice kernel fix required by Node/V8. No additional upstream
patch is included. The upstream macOS target supplies the virtualization signing
entitlement. No additional upstream fixes were needed for the Mac validation.

## Use it in a consumer

Produce an ARM64 runtime with `linux_chromium_runtime(arch = "arm64", ...)`, using
matching Linux ARM64 Chromium and Node archives. Its default system preset is
`@rules_web_e2e//playwright/presets:noble_20260901_arm64`. See
`examples/browser-runtime:browser_arm64` for exact archive URLs and checksums.
To build that runtime directly:

```sh
cd examples/browser-runtime
bazelisk build //:browser_arm64
```

For a custom `browser_runtime`, set `arch = "arm64"` and the appropriate loader
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

`target_arch` defaults to `x64` for existing callers. ARM64 chooses the built-in
Linux ARM64 target platform and requires a Linux ARM64 execution platform. A
custom `target_platform` must match the runtime's CPU and Linux OS. Mixing
architectures fails during analysis rather than executing the wrong binaries.

Use the [actiond configuration](actiond.md), replacing its execution platforms
line with:

```text
build:vrt --extra_execution_platforms=@platforms//host:host,@rules_web_e2e//internal:linux_arm64
```

Add `bazel_dep(name = "platforms", version = "1.1.0")` to the consumer MODULE
if it does not already declare `platforms`. Keep the host platform first, so ordinary build tools execute on the Mac. Do not
set the entire build's `--platforms` to Linux; the rule transitions the fixture
inputs while keeping result application local. Keep remote fallback disabled.
Start the worker built by the integration script in another terminal:

```sh
/tmp/rules-web-vrt-arm64/actiond-worker serve-vm \
  --root=/tmp/rules-web-vrt-arm64/vm --listen=127.0.0.1:8980 \
  --memory-mib=6144 --cpus=2 --cas-image-size-mib=4096
```

Supply the worker SHA256 as described in the execution guide. Then use the usual
`bazelisk test --config=vrt //:visuals_arm64` and
`bazelisk run --config=vrt //:visuals_arm64.update` commands.

ARM64 rendering is not assumed pixel-identical to amd64. Review the first ARM64
captures and use separate baseline directories until equivalence is established.
