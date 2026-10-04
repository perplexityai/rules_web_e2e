# Linux amd64 worker preset

Supervisor supplies pinned actiond 0.0.7, execution flags, startup, logs,
and cleanup. Use it with [browser preset](browser-runtime.md) or compatible
custom Linux amd64 runtime. It owns one worker per command or CI bucket.

Consumers that start worker on another machine can depend on
`@rules_web_e2e//worker:supervisor` and call `worker.supervisor.bazel_config(endpoint)`
to generate same Bazel flags for forwarded loopback endpoint.

## Materialize once, run outside Bazel

From your consuming workspace:

```sh
mkdir -p .web-e2e
bazel run --script_path="$PWD/.web-e2e/run" @rules_web_e2e//worker:runner
.web-e2e/run doctor
.web-e2e/run test //ui:component_test //ui:visual_test
.web-e2e/run run //ui:visual_test.update
```

Add `.web-e2e/` to your workspace's `.gitignore`. Generated launcher refers to
Bazel outputs; regenerate it after upgrading rules or changing machines.
Materializing it does not start VM. Run resulting script from workspace
root, outside `bazel run`, so nested test invocation can acquire Bazel's lock.
Pass `--bazel=bazelisk` before operation if that your Bazel command.

Worker host must be Linux amd64 with readable/writable `/dev/kvm` and
`/dev/vhost-vsock`, usable `io_uring`, and sufficient memory/disk. Default
6 GiB VM, two CPUs, two concurrent Bazel jobs, and 4 GiB CAS. Supervisor never
changes device permissions or provisions machine. `doctor` checks platform,
devices, and executable checksum; only actual test validates VM startup and
execution. Missing prerequisites fail with actionable error, without host fallback.
For large VRT buckets, pass `--memory-mib=12288 --cas-image-size-mib=32768`
before operation and reserve enough host memory and disk for guest,
Bazel, and CAS. Defaults remain 6144 MiB of memory and 4096 MiB of CAS.

## CI buckets

Use same launcher for single test invocation. For bucket that makes
multiple Bazel calls, keep one worker alive with `exec`:

```sh
.web-e2e/run --log-dir=artifacts/web-worker exec -- bash ci/browser-tests.sh
```

Child receives `RULES_WEB_E2E_BAZELRC` and `RULES_WEB_E2E_ENDPOINT`:

```sh
bazel --bazelrc="$RULES_WEB_E2E_BAZELRC" test --config=web-e2e //ui:component_test
bazel --bazelrc="$RULES_WEB_E2E_BAZELRC" test --config=web-e2e //ui:visual_test
```

Browser rules key results by worker SHA256. Generated profile routes isolated
tests and VRT actions remotely, and keeps VRT report wrappers local. Host fallback
disabled. Use it only for isolated browser/VRT targets; keep live-service and
unrelated unit tests in separate jobs. Do not override its execution settings.

Browser targets include preset worker SHA256 in their execution properties.
Ordinary prerequisites do not: prebuilding TypeScript or Vite inputs preserves
their cache keys when worker starts. Browser results remain cacheable and
invalidate when preset worker changes. Rules and supervisor read
same worker manifest; loading its identity does not download worker binary.

For custom worker, set `worker_sha256` on browser test targets to SHA256 of
that worker binary. Linux amd64 defaults to preset digest; ARM64 has no preset
digest and requires explicit value to track custom worker upgrades.

Caching stays enabled. `--nocache_test_results` reruns native browser tests;
add `--remote_accept_cached=false` to force VRT actions too.

## Ownership and failure behavior

- Listens on `127.0.0.1:8980`; change it with `--port`. Occupied port fails.
  Unauthenticated endpoint for trusted single-user host.
- Uses private temporary VM/CAS storage per invocation and persistent logs under
  `.web-e2e/logs/` or `--log-dir`. `--startup-timeout` defaults to 90 seconds.
- Preserves command exit status. Worker death fails command. SIGINT/SIGTERM
  stop owned process groups; cleanup removes VM state and retains logs/config.
- Worker gets minimal environment. Test inputs and environment remain
  explicitly declared; supervisor grants no secrets or external network access.

[VM integration workflow](../.github/workflows/actiond-production.yaml)
exercises this launcher, React example, retries, updates, timeouts, and cancellation.
