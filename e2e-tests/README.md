# Isolated E2E tests

`workspace/` is a separate Bazel module with its own dependency lockfile. It
contains one page server and one component gallery, plus focused regression specs.
The page checks combine interaction, native Playwright configuration, and reload
isolation. The gallery covers component interaction and visual capture, including
caller-owned package and executable preservation. Unused example targets and static baselines are omitted.

Use Node 24+ and Bazelisk. CI typechecks the harness with the root Bazel build;
Node executes the TypeScript directly, without Python or a separate JS build.

```sh
# After installing the Chromium version pinned in the root package.json:
node e2e-tests/run.ts
```

The runner copies the consumer to a temporary directory, rewrites its repository
override, and uses a separate Bazel output base. Tests execute with result caching
disabled. Set `BAZEL`, `PLAYWRIGHT_BROWSERS_PATH`, and `E2E_TEST_ARTIFACTS` to override
the executable, browser cache, and saved reports. CI runs on Linux and macOS.

For the real Linux VM suite, use a KVM/vsock host:

```sh
work=$(mktemp -d)
ACTIOND_SKIP_WORKER_SOURCE=1 bash e2e-tests/actiond/prepare.sh "$work"
node e2e-tests/run.ts prepare "$work"
bazelisk run --script_path="$work/run-web-e2e" //worker:runner
"$work/run-web-e2e" exec -- node e2e-tests/vm.ts "$work"
```

`vm.ts` shares one worker across execution, retry, isolation, capture/compare,
empty/failed capture, timeout, cancellation, and recovery checks. It creates real
PNG references in the disposable consumer, checks downloaded failure artifacts,
and deliberately swaps references to prove comparison fails. Source baselines
must remain unchanged after unsuccessful captures; recovery actions bypass caches.
The package fixture starts a real server through a transitive npm graph, checks
an internal symlink, invokes an unchanged Bash executable and Node subprocess,
and carries an unused foreign ELF. The VM suite captures and compares its page.

The two shell scripts under `actiond/` only provision the Linux runtime and macOS
worker; browser assertions and process supervision are TypeScript.

The Linux VM workflow also runs `capacity.ts` under a second supervisor with 8192 MiB RAM and an 8192 MiB CAS disk. It verifies the actual disk size, guest-visible memory, and a browser screenshot.

The VM suite also freezes the runner after a real screenshot and verifies the parent deadline, downloaded evidence, untouched baselines, and an uncached recovery run.

Host CI also runs `temp-paths.ts` with deep and symlinked temp roots, checking real Chromium screenshots and scratch cleanup.

The VM gallery also captures and compares a real pointer-hover state, asserting CSS `:hover` inside `beforeCapture`.

The Linux amd64 VM suite also records a page interaction using a caller-pinned
FFmpeg helper and verifies the downloaded video is nonempty with a WebM header.
A paired run without the helper must fail with the missing-FFmpeg diagnostic.
Both actions bypass remote action and test-result caches. Other suites keep
their runtime without FFmpeg, covering the optional-input behavior.

Host CI runs `lingering.ts` with a real browser and a background process holding
Playwright's output pipes open. It checks forced cleanup, bounded completion,
credential filtering, retained screenshots, and scratch removal.
