# Isolated E2E tests

`workspace/` is a separate Bazel module with its own dependency lockfile. It
contains one page server and one component gallery, plus focused regression specs.
The page checks combine interaction, native Playwright configuration, and reload
isolation. The gallery covers component interaction and visual capture, including
hover on the hover PR. Unused example targets and static baselines are omitted.

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
PR-specific runfile and hard-deadline regressions extend this suite.

Where present, `temp-paths.ts`, `capacity.ts`, and `release.ts` cover short Chromium
socket paths, real supervisor resource sizes, and the actual release archive.
They share workspace/process helpers in `harness.ts` and run in CI.
The two shell scripts under `actiond/` only provision the Linux runtime and macOS
worker; browser assertions and process supervision are TypeScript.
