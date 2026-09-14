# actiond Chromium prototype

Throwaway experiment, not a replacement for the production VRT backend.

The action runs a Node HTTP fixture, Chromium, and screenshot comparison together.
Node, Playwright, Chromium, shared libraries, fonts, and even the ELF loader are
ordinary declared inputs. No OCI API, injected glibc runtime, Testcontainers,
Docker socket, or Ryuk is used inside the action.

## Reproduce

Setup requires Linux amd64, Python 3, curl, Git, Docker, and the repository's
installed pnpm dependencies. Preload the Playwright image pinned in `prepare.sh`.
Docker only extracts the image during preparation; the action consumes files.

```sh
bash experiments/actiond/prepare.sh /tmp/actiond-prototype
# With an existing amd64 actiond worker:
bash experiments/actiond/run-actiond.sh /tmp/actiond-prototype grpc://127.0.0.1:8980
```

`run-actiond.sh` invokes a standalone Bazel action with local fallback disabled.
It downloads declared PNG outputs into `/tmp/actiond-prototype/results`; source
baselines are untouched. `ACTIOND_BAZEL` may select the Bazel executable.

Without KVM, test the actual actiond process runner separately:

```sh
# Also preload the Ubuntu image pinned in run-sandbox.sh.
bash experiments/actiond/run-sandbox.sh /tmp/actiond-prototype
```

That diagnostic uses a disposable container to grant namespace/mount privileges.
Inside it, the unmodified actiond runner applies its own chroot, namespaces,
uid/gid drop, and seccomp filter. This does **not** exercise the VM, REAPI, CAS
input filesystem, or Bazel output collection. The Docker helper is a diagnostic,
not the proposed deployment architecture.

## Local results

- Unmodified actiond runner source at `8a42c3d481df3a1bf1b80e95a9bb991a207fc035`.
- Chromium `153.0.8010.12` / Playwright `1.63.0`, Linux amd64.
- `chromiumSandbox: false` and `--no-zygote` produced matching 640x360 PNGs across
  fresh invocations. The default zygote path failed with child/GPU startup errors;
  its root cause is not established. `--zygote` reproduces that diagnostic.
- `--sandbox` failed with “No usable sandbox” in the nested container harness;
  this does not establish which restriction a real VM would hit first.
- Fixture HTTP and font loading succeeded; a direct external TCP connection
  failed with `ENETUNREACH`. No `/dev/shm`, Docker socket, or extra device mounts.
- PNG: 11,389 bytes, SHA-256
  `498f5f17cc8af0437eeabf78db5c6079fd1d3f3009012537d5d0dc9ee9244362`.
- Bazel aquery resolves Linux amd64 and lists the loader, browser, libraries,
  fonts, and Playwright files as inputs, with PNGs in a declared TreeArtifact.

## VM kernel finding

The released actiond `v0.0.6` VM boots and accepts the Bazel action, but Node aborts
in V8's `DiscardSystemPages`. The minimal `kernel-probe.c` action independently
returns `madvise(MADV_DONTNEED): errno=38 (Function not implemented)`.
[Failing VM run](https://github.com/perplexityai/rules_web_e2e/actions/runs/34775725126).

Both actiond kernel configs use `allnoconfig` and omit `CONFIG_ADVISE_SYSCALLS`.
`actiond-advice.patch` enables it for ARM64 and amd64. The prototype workflow
rebuilds the exact `v0.0.6` kernel source with this patch and passes it to the
released worker through `--kernel`. It performs all compilation locally on the
GitHub runner; no BuildBuddy upload or remote build service is used.

The patched main-branch kernel also builds locally. The patched release kernel
passed the syscall probe and screenshot action through real Bazel REAPI execution
with local fallback disabled. Both downloaded PNGs match the local hash above.
[Passing VM run](https://github.com/perplexityai/rules_web_e2e/actions/runs/34775967325).
The local host has no `/dev/kvm`; KVM validation ran on GitHub's Ubuntu runner.

## Decision

The process-level proof requires **no actiond userspace changes**. The VM proof
requires the memory-advice kernel fix above. Before adding OCI runtime support
or relaxing seccomp, validate an existing editor fixture on the patched VM. Production integration still needs an optional executor
backend, reviewed baseline-update handling, amd64 worker selection on Apple
Silicon, and cleanup/isolation coverage. One stable fixture is not evidence of
cross-architecture pixel equivalence or full Chromium compatibility.
