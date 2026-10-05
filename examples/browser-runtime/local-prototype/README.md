# Local Linux prototype

Question: can our declared Chromium runtime run locally without actiond or KVM,
using only bundled libraries and fonts?

Yes, on the tested Linux x64 and ARM64 machines. This is an opt-in Bazel test, not a
supported browser execution backend. Production rules unchanged.

Uses [Bubblewrap](https://github.com/containers/bubblewrap), built by its
[Bazel registry module](https://registry.bazel.build/modules/bubblewrap).
An empty root gets read-only mounts for the runtime, Playwright, and probe.
Scratch, outputs, private `/proc`, and minimal `/dev` are writable.
Only loopback networking exists. No host `/usr`, `/etc`, fonts, home, GPU devices,
or KVM device mounted. The bundled loader is exposed at the normal ELF path so
Node, Chromium, and subprocesses launch unchanged.

## Run with Bazel

Need Linux with unprivileged user namespaces. The example selects the x64 or
ARM64 browser from the target platform; execution must use the same architecture.
Bazel builds Bubblewrap 0.13.0 and fetches checksum-pinned Playwright core 1.63.0.
No system Bubblewrap or npm installation needed.

From `examples/browser-runtime`:

```sh
bazelisk test //:local_chromium_test //:local_chromium_missing_library_test \
  --nocache_test_results --test_output=errors
```

Tests tagged `manual` and `local`: opt in explicitly, run on the local host with
user namespaces enabled. Use `--nocache_test_results` when checking a new host;
the host kernel is not represented in the test's cache key. The wrapper still
uses host Bash and path utilities; Bubblewrap uses the configured C toolchain.
This is not yet a fully pinned execution platform.

The rendering probe starts a loopback fixture, clicks a button, checks the font
is DejaVu Sans, and saves a screenshot. Chromium sandbox stays enabled. It checks
live renderer seccomp, application memory mappings, and private network
interfaces. Bazel collects `page.png`, `fonts.json`, `processes.json`, and
`loader.*` under test undeclared outputs. Loader diagnostics and memory maps are
not a complete syscall/file-access trace. Bubblewrap's supervisor still has its
host mappings; application checks cover Node and Chromium processes.

The second test hides `libnss3.so` and requires Chromium startup to fail with a
missing-library error. Unexpected launch or an unrelated error fails the test.

## Manual diagnostic run

For extra Bubblewrap arguments, supply a runtime and standalone Playwright core
package directory. This path uses system Bubblewrap unless `BWRAP` names a binary.

```sh
bazelisk build //:browser
mkdir -p /tmp/chromium-probe
./local-prototype/run.sh ./bazel-bin/browser "$PLAYWRIGHT_CORE" /tmp/chromium-probe
```

## Findings and limits

- Both tests pass on Linux x64 and native ARM64 with Bazel 8.6.0 and 9.2.0.
- ARM64 devbox has no KVM device. Both tests also pass twice with Bazel 9.
- ARM64 validation reused the existing assembly checkout. All 606 runtime files
  match the current PR bundle in content and permissions.
- Chromium 153.0.8010.12 and Node 24.14.0 run from the existing Bazel bundle.
- Real interaction and screenshot pass with Chromium sandbox enabled.
- Node/browser mappings use bundled code and libraries plus private scratch.
- Hiding `libnss3.so` prevents startup. No host fallback.
- Repeated fresh runs produce identical screenshot bytes on the tested machine.
- Host kernel still used. Both tested hosts run Debian 13; other distributions
  remain untested.

Next: validate on another Linux distribution; trace broader workloads,
including fonts, media, subprocesses, and DNS behavior. Then integrate through
an existing Bazel execution mechanism with declared inputs, outputs, cleanup,
and execution-platform cache identity. Do not turn this probe into another
runtime framework or silently change host mode.
