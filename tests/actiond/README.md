# actiond integration tests

The production workflow builds the pinned upstream actiond worker and runs the
public browser rules against its Linux amd64 VM. The host needs KVM and
vhost-vsock; actiond runs separately from Bazel.

`prepare.sh` downloads upstream source through Bazel's checksum-pinned
`worker_source` target and builds the caller runtime through the example's Bazel
workspace. Upstream is built as a standalone workspace to retain its MODULE
patches and toolchain overrides. There are no local actiond patches or standalone
Zig downloads.

`prepare-public.mjs` creates a disposable React example workspace.
`run-public-actiond.sh WORK_DIRECTORY ENDPOINT` verifies native E2E/component
execution, isolation, failures, repeated runs, retries, VRT comparison/capture,
empty and failed capture protection, deadlines, and cancellation recovery.
The VM and its CAS are shared across these actions, while test state is isolated.

For the validated local Apple Silicon VRT lane, run
`bash tests/actiond/run-macos-arm64.sh /tmp/rules-web-vrt-arm64` from the repository
root. See [setup and validation limits](../../docs/macos-arm64-vrt.md).
