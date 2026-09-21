# Linux amd64 worker preset

The optional worker supervisor supplies checksum-pinned actiond 0.0.7 (including
its VM kernel), execution settings, readiness checks, logs, and cleanup. It runs
one private worker for one Bazel invocation or CI bucket. Browser runtimes remain
explicit inputs on test targets; this worker supports the documented Linux amd64
Chromium runtime and Playwright 1.63.0 integration suite.

## Materialize once, run outside Bazel

From your consuming workspace:

```sh
mkdir -p .web-e2e
bazel run --script_path="$PWD/.web-e2e/run" @rules_web_e2e//worker:runner
.web-e2e/run doctor
.web-e2e/run test //ui:component_test //ui:visual_test
.web-e2e/run run //ui:visual_test.update
```

Add `.web-e2e/` to your workspace's `.gitignore`. The generated launcher refers to
Bazel outputs; regenerate it after upgrading the rules or changing machines.
Materializing it does not start a VM. Run the resulting script from the workspace
root, outside `bazel run`, so the nested test invocation can acquire Bazel's lock.
Pass `--bazel=bazelisk` before the operation if that is your Bazel command.

The worker host must be Linux amd64 with readable/writable `/dev/kvm` and
`/dev/vhost-vsock`, usable `io_uring`, and sufficient memory/disk. The default is a
6 GiB VM, two CPUs, two concurrent Bazel jobs, and a 4 GiB CAS. The supervisor never
changes device permissions or provisions a machine. `doctor` checks the platform,
devices, and executable checksum; only an actual test validates VM startup and
execution. Missing prerequisites fail with an actionable error, without host fallback.

## CI buckets

Use the same launcher for a single test invocation. For a bucket that makes
multiple Bazel calls, keep one worker alive with `exec`:

```sh
.web-e2e/run --log-dir=artifacts/web-worker exec -- bash ci/browser-tests.sh
```

The child receives `RULES_WEB_E2E_BAZELRC` and `RULES_WEB_E2E_ENDPOINT`:

```sh
bazel --bazelrc="$RULES_WEB_E2E_BAZELRC" test --config=web-e2e //ui:component_test
bazel --bazelrc="$RULES_WEB_E2E_BAZELRC" test --config=web-e2e //ui:visual_test
```

The generated rc includes the worker's SHA256 as an execution property. It routes
capture/comparison remotely, and lets Bazel choose remote versus local TestRunner
execution from each rule's requirements: native browser tests prohibit local
execution, while VRT report wrappers prohibit remote execution. Remote failure
fallback is disabled. Include only isolated browser/VRT targets in this profile;
live-service tests and unrelated unit tests belong in their own jobs. Do not
override these execution settings when using the preset.

Bazel's usual result caching remains enabled. Use `--nocache_test_results` to
rerun native browser tests. To force VRT capture/comparison actions as well, add
`--remote_accept_cached=false`. The preset does not change global workspace flags.

## Ownership and failure behavior

The default listener is `127.0.0.1:8980`; `--port` selects another loopback port.
An occupied port is an error. The supervisor never reuses another process's
listener and never binds to a remote interface. This unauthenticated endpoint is
for a trusted, single-user worker host, not a shared multi-tenant remote service.

Each invocation gets private temporary VM/CAS storage and a separate persistent
log directory below `.web-e2e/logs/` (or `--log-dir`). Worker startup has a 90-second
timeout, configurable with `--startup-timeout`. TCP readiness is followed by the
real Bazel operation; it is not proof of a healthy VM.

Command failure preserves its exit status. Worker death stops the command and
fails the invocation. SIGINT/SIGTERM stop both owned process groups; VM/CAS state
is removed afterward. Worker logs and the generated rc remain for CI artifacts.
The worker process receives a minimal environment; application/test environment
still follows the test rule's explicit input contract. The supervisor does not
supply cloud credentials, secrets, or access to external services inside actions.

The [production integration workflow](../.github/workflows/actiond-production.yaml)
uses the published worker through this same launcher and exercises native tests,
VRT updates, isolation, retries, timeouts, and cancellation. Generic lifecycle
coverage uses real subprocesses and loopback sockets without requiring KVM.
