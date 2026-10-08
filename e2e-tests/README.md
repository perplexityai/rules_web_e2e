# Isolated E2E tests

`workspace/` separate Bazel module with its own dependency lockfile. It
contains one page server and one component gallery, plus focused regression specs.
Page checks combine interaction, native Playwright configuration, and reload
isolation. Gallery covers component interaction and visual capture, including
caller-owned package and executable preservation. Unused example targets and static baselines omitted.

Use Node 24+ and Bazelisk. CI typechecks harness with root Bazel build;
Node executes TypeScript directly, without Python or separate JS build.

```sh
# After installing the Chromium version pinned in the root package.json:
node e2e-tests/run.ts
```

Runner copies consumer to temporary directory, rewrites its repository
override, and uses separate Bazel output base. Tests execute with result caching
disabled. Set `BAZEL`, `PLAYWRIGHT_BROWSERS_PATH`, and `E2E_TEST_ARTIFACTS` to override
executable, browser cache, and saved reports. CI runs on Linux and macOS.

For real Linux VM suite, use KVM/vsock host:

```sh
work=$(mktemp -d)
ACTIOND_SKIP_WORKER_SOURCE=1 bash e2e-tests/actiond/prepare.sh "$work"
node e2e-tests/run.ts prepare "$work"
bazelisk run --script_path="$work/run-web-e2e" //worker:runner
"$work/run-web-e2e" exec -- node e2e-tests/vm.ts "$work"
```

`vm.ts` shares one worker across execution, retry, isolation, capture/compare,
empty/failed capture, timeout, cancellation, and recovery checks. It creates real
PNG references in disposable consumer, checks downloaded failure artifacts,
and deliberately swaps references to prove comparison fails. Source baselines
must remain unchanged after unsuccessful captures; recovery actions bypass caches.
Package fixture starts real server through transitive npm graph, checks
internal symlink, invokes unchanged Bash executable and Node subprocess,
and carries unused foreign ELF. VM suite captures and compares its page.

Two shell scripts under `actiond/` only provision Linux runtime and macOS
worker; browser assertions and process supervision TypeScript.

Linux VM workflow also runs `capacity.ts` under second supervisor with 8192 MiB RAM and 8192 MiB CAS disk. It verifies actual disk size, guest-visible memory, and browser screenshot.

VM suite also freezes runner after real screenshot and verifies parent deadline, downloaded evidence, untouched baselines, and uncached recovery run.

Host CI also runs `temp-paths.ts` with deep and symlinked temp roots, checking real Chromium screenshots and scratch cleanup.

`cacheable.ts` checks host E2E/component result reuse with runtime-only inputs:
erased type edits and map-only edits retain cache hits, while emitted JavaScript,
app, mock, and browser input changes rerun tests. Default uncached targets still
execute on every invocation.

VM gallery also captures and compares real pointer-hover state, asserting CSS `:hover` inside `beforeCapture`.

Linux amd64 VM suite also records page interaction using caller-pinned
FFmpeg helper and verifies downloaded video nonempty with WebM header.
Paired run without helper must fail with missing-FFmpeg diagnostic.
Both actions bypass remote action and test-result caches. Other suites keep
their runtime without FFmpeg, covering optional-input behavior.

Host CI runs `lingering.ts` with real browser and background process holding
Playwright's output pipes open. It checks forced cleanup, bounded completion,
credential filtering, retained screenshots, and scratch removal.

`process-owned.ts` exercises config-free `browser_process_test` targets with
caller-declared Chromium and checksum-pinned Electron 40.0.0. It clicks real
windows, verifies persistent Chromium cookies across relaunch, and checks
screenshots, process termination, and profile/scratch removal after success and
runner timeout, including Electron children launched into separate process groups.
Provision matching Playwright Chromium first; on Linux run under
`xvfb-run -a`. CI runs both Linux and macOS. Tests never download executables.

On Linux amd64 and ARM64 VM suite checks that visual comparisons native tests:
flaky retries and repeated runs launch distinct browsers, disabling test-result
caching causes fresh executions, and failed comparisons download JUnit and diff
images through Bazel test outputs. ARM64 retains comparison-action checks.

Run the same isolation and lifecycle suite without a VM on Linux:

```sh
node e2e-tests/run.ts local /tmp/local-browser-validation
```

The driver selects native x64/ARM64, uses declared runtime targets directly, and
keeps generated baselines in the supplied disposable directory. See
[local Linux execution](../docs/local-linux.md).

Local cache probes use a disposable disk cache by default. Set
`LOCAL_BROWSER_CACHE_CONFIGURED=1` to use your normal Bazel cache configuration.
CI does this so `setup-bazel` persists the tested cache between jobs.
The cache probe starts without execution properties, then checks that declared
input, baseline, and optional execution-property changes invalidate results.
