# Linux amd64 worker preset

The supervisor supplies pinned actiond 0.0.7, execution flags, startup, logs,
and cleanup. Use it with the [browser preset](browser-runtime.md) or a compatible
custom Linux amd64 runtime. It owns one worker per command or CI bucket.

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

The generated profile keys results by worker SHA256, routes isolated tests and
VRT actions remotely, and keeps VRT report wrappers local. Host fallback is
disabled. Use it only for isolated browser/VRT targets; keep live-service and
unrelated unit tests in separate jobs. Do not override its execution settings.

Caching stays enabled. `--nocache_test_results` reruns native browser tests;
add `--remote_accept_cached=false` to force VRT actions too.

## Ownership and failure behavior

- Listens on `127.0.0.1:8980`; change it with `--port`. An occupied port fails.
  The unauthenticated endpoint is for a trusted single-user host.
- Uses private temporary VM/CAS storage per invocation and persistent logs under
  `.web-e2e/logs/` or `--log-dir`. `--startup-timeout` defaults to 90 seconds.
- Preserves command exit status. Worker death fails the command. SIGINT/SIGTERM
  stop owned process groups; cleanup removes VM state and retains logs/config.
- The worker gets a minimal environment. Test inputs and environment remain
  explicitly declared; the supervisor grants no secrets or external network access.

The [VM integration workflow](../.github/workflows/actiond-production.yaml)
exercises this launcher, the React example, retries, updates, timeouts, and cancellation.
