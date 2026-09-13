# actiond validation and patches

The production backend is documented in [VRT on actiond](../../docs/actiond.md).
This directory keeps its worker patches, CI fixtures, and earlier diagnostics.

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

## Production validation

The production workflow builds actiond at `8a42c3d` with both patches below,
starts a Linux amd64 VM, and runs `prepare-public.mjs` / `run-public-actiond.sh`.
The fixture constructs a caller-owned OCI layout through Bazel and extracts its
runtime with `browser_runtime_oci`. Public `.update` and test targets execute
capture/comparison actions remotely and consume downloaded results locally.
Only the temporary example checkout receives baseline updates.

[Run 34781995883](https://github.com/perplexityai/rules_web_e2e/actions/runs/34781995883)
passes native/component capture and comparison, network isolation, failed/empty
captures, screenshot diffs, and execution deadlines. The replacement workflow
also checks cancellation and a Bazel `js_binary` fixture server. See the current
PR checks for the exact tested revision.

A 3 GiB guest ran out of memory with three simultaneous suites. CI uses 6 GiB
and at most two actions; size workers for input staging and application memory.
The real FormatJS editor gallery also captures, locally applies references, and
compares all eight screenshots in the actiond process sandbox. That validation
is separate from the VM fixtures and does not establish a full consumer CI migration.

## Local actiond patches

- `actiond-advice.patch`: enables memory-advice syscalls in both kernel configs;
  submitted as [upstream PR #48](https://github.com/hermeticbuild/actiond/pull/48).
- `actiond-input-rootfs.patch`: exposes selected directories from a declared
  runtime input tree at normal Linux paths, preserving executor-owned devices,
  `/proc`, temporary storage, and network isolation. `input-rootfs-env` resolves
  its path from a declared command variable, which supports Bazel output paths.
  Maintained separately in local actiond commits `66e2dca` and `f713bca` for
  upstreaming. The full actiond build and both unit-test targets pass.

The native macOS VM backend has not been exercised here. ARM64 clients must
select an amd64 worker for these baseline inputs.

Earlier `prepare-production.mjs` / `run-production-actiond.sh` scripts are
historical diagnostics. Their hand-staged glob omitted an npm file beneath a
nested Bazel package; public rules collect actual runfiles and tree artifacts.
Use the production workflow above for the supported execution path.
