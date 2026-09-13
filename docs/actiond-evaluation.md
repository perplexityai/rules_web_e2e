# actiond evaluation for VRT

Historical evaluation; the implemented path is described in [VRT on actiond](actiond.md).

Source review on 2026-09-13 at upstream commit
[`8a42c3d`](https://github.com/hermeticbuild/actiond/tree/8a42c3d481df3a1bf1b80e95a9bb991a207fc035).
The initial review below is followed by a [runnable prototype](../experiments/actiond/README.md).
The prototype subsequently rendered under actiond's unmodified process runner.
Full VM/REAPI execution also passed on a GitHub KVM runner after enabling
`CONFIG_ADVISE_SYSCALLS` in the guest kernel; see the prototype's linked CI evidence.

## Assessment

Promising optional execution backend; not a drop-in replacement for the current
Testcontainers VRT implementation. Keep the current backend for AGI and FormatJS
while evaluating a general remote-execution-compatible VRT path.

## What improves

The entire test action could execute inside Linux: Node, fixture server, browser,
and comparison. actiond provides a Bazel REAPI executor/cache, immutable declared
inputs, a VM boundary, and per-action loopback-only networking. The VM has no
external network device. This would constrain consumer Node code as well as the
browser and remove Docker/Ryuk from that execution path. These are architectural
benefits, not a tested Chromium integration.
[Architecture](https://github.com/hermeticbuild/actiond/blob/8a42c3d481df3a1bf1b80e95a9bb991a207fc035/ARCHITECTURE.md)

## Integration gaps

- **Architecture:** Apple Silicon gets an ARM64 Linux guest; Windows/Linux guests
  match their host architecture. Our current VRT browser uses Linux amd64 on all
  hosts. Linux alone does not establish pixel equivalence between ARM64 and amd64;
  a common architecture or verified separate baseline policy remains necessary.
  [VM topology](https://github.com/hermeticbuild/actiond/blob/8a42c3d481df3a1bf1b80e95a9bb991a207fc035/ARCHITECTURE.md#topology)
- **Browser provisioning:** packaged runtimes contain selected glibc versions and
  Bash. The executor selects those runtimes, rather than a caller-owned OCI image.
  Chromium, additional shared libraries, fonts, and font configuration would need
  declared packaging and a suitable launcher, or new runtime support.
  [Runtime definitions](https://github.com/hermeticbuild/actiond/blob/8a42c3d481df3a1bf1b80e95a9bb991a207fc035/runtimes/BUILD.bazel),
  [executor](https://github.com/hermeticbuild/actiond/blob/8a42c3d481df3a1bf1b80e95a9bb991a207fc035/src/action_executor.zig#L305-L331)
- **Rule changes:** our browser tests carry `no-remote` and `no-cache`; VRT starts
  Testcontainers unconditionally. An executor backend must launch a declared
  browser within the action and run the fixture server in that same action.
  [Current rules](../internal/browser.bzl), [runner](../runtime/runner.ts)
- **Baseline updates:** `.update` currently copies into `BUILD_WORKSPACE_DIRECTORY`.
  Remote capture must instead produce downloadable outputs, with a small local
  wrapper applying them to the source workspace. Merely enabling remote execution
  does not move the final `bazel run` executable into the executor.
  [Baseline handling](../runtime/baselines.ts), [runner](../runtime/runner.ts)
- **Chromium compatibility:** the action sandbox rejects installing additional
  seccomp filters. Chromium sandbox behavior needs a smoke test; do not assume its
  normal sandbox works unchanged. Time and randomness still require test control.
  [Sandbox implementation](https://github.com/hermeticbuild/actiond/blob/8a42c3d481df3a1bf1b80e95a9bb991a207fc035/src/action_runner.zig#L817-L854)
- **Provisioning:** actiond replaces the Docker prerequisite with its own VM worker.
  Linux requires KVM/vhost-vsock access and io_uring; Windows requires Hyper-V.
  Linux-compatible Bazel toolchains must also be configured.
  [Setup](https://github.com/hermeticbuild/actiond/blob/8a42c3d481df3a1bf1b80e95a9bb991a207fc035/README.md#start-the-worker)

## Prototype follow-up

The prototype supplies its own ELF loader alongside Chromium and its libraries,
so no embedded glibc selection or OCI runtime support is needed for the smoke
action. It renders with the existing seccomp filter and no `/dev/shm` changes,
using `chromiumSandbox: false` and `--no-zygote`. The real VM initially failed
because `madvise` was absent (`ENOSYS`). Enabling `CONFIG_ADVISE_SYSCALLS=y`
resolved the syscall probe and screenshot failure; downloaded VM PNGs matched
the local result byte-for-byte. See its README for exact limits.

## Next experiment

Build one existing editor screenshot case as an ordinary Linux action with a
fully declared Chromium runtime. Run capture and comparison inside actiond,
return a PNG through Bazel outputs, and test local baseline application. Verify
Chromium startup, fonts, isolation, cancellation, and repeated captures. Compare
ARM64 and amd64 outputs explicitly before considering shared baselines. Keep the
interface REAPI-compatible so callers can choose actiond or another executor.
