# Browser-rule E2E consumer

This is a separate Bazel module with its own dependency lockfile, public rule
calls, application, server, browser specs, and screenshot fixtures. It consumes
this repository through `local_path_override`; it does not import private runtime
functions. All source and BUILD files are checked in here.

CI copies this workspace to a disposable directory so capture tests can write
baselines without modifying source files. The preparation script changes only
the repository override path and `_TARGET_ARCH`, then copies the prepared runtime
archive. It does not generate JavaScript, TypeScript, or BUILD declarations.

From the repository root on a Linux KVM/vsock host:

```sh
work=/tmp/rules-web-e2e-consumer
ACTIOND_SKIP_WORKER_SOURCE=1 bash tests/actiond/prepare.sh "$work"
node tests/actiond/prepare-public.mjs "$work"
bazelisk run --script_path="$work/run-web-e2e" //worker:runner
"$work/run-web-e2e" exec -- bash tests/actiond/run-public-actiond.sh "$work"
```

The harness runs `bazel test` and `bazel run` inside the copied module with its own
output base, checks failures and downloaded artifacts, and verifies that failed
captures preserve existing baseline bytes. Capture/compare fixtures write and
compare real Chromium PNGs in the disposable workspace.

Host-only fixtures can be run directly from this directory after provisioning
Playwright's matching Chromium and setting `PLAYWRIGHT_BROWSERS_PATH`:

```sh
bazelisk test //:host_e2e_test //:host_native_config_test --test_output=errors
```
