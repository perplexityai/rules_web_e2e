# Local Linux prototype

Question: can our declared Chromium runtime run locally without actiond or KVM,
using only bundled libraries and fonts?

Yes, on the tested Linux x64 machine. This is a manual feasibility probe, not a
supported Bazel execution backend. Production rules unchanged.

Uses [Bubblewrap](https://github.com/containers/bubblewrap), an existing Linux
namespace tool. An empty root gets read-only mounts for the runtime, Playwright,
and probe. Scratch, outputs, private `/proc`, and minimal `/dev` are writable.
Only loopback networking exists. No host `/usr`, `/etc`, fonts, home, GPU devices,
or KVM device mounted. The bundled loader is exposed at the normal ELF path so
Node, Chromium, and subprocesses launch unchanged.

## Run

Need Linux x64 with unprivileged user namespaces and Bubblewrap. Tested with
Bubblewrap 0.11.0 and Playwright core 1.63.0. Supply an existing standalone
`playwright-core` package directory. The prototype does not download it.

From `examples/browser-runtime`:

```sh
bazelisk build //:browser
mkdir -p /tmp/chromium-probe
./local-prototype/run.sh ./bazel-bin/browser "$PLAYWRIGHT_CORE" /tmp/chromium-probe
```

Probe starts a loopback fixture, clicks a button, checks the rendered font is
DejaVu Sans, and saves a screenshot. Chromium sandbox stays enabled. It checks
live renderer seccomp, application memory mappings, and private network
interfaces. `processes.json` records mappings and status; `loader.*` records
loader diagnostics. These are not a complete syscall/file-access trace.
Bubblewrap's supervisor still has its host mappings; application checks cover
Node and Chromium processes.

To prove missing libraries do not fall back to the host, mask a required library:

```sh
mkdir -p /tmp/chromium-probe-missing
./local-prototype/run.sh ./bazel-bin/browser "$PLAYWRIGHT_CORE" \
  /tmp/chromium-probe-missing --ro-bind /dev/null /lib/libnss3.so
```

Expected: nonzero exit, Chromium cannot load `libnss3.so`.

## Findings and limits

- Chromium 153.0.8010.12 and Node 24.14.0 run from the existing Bazel bundle.
- Real interaction and screenshot pass with Chromium sandbox enabled.
- Node/browser mappings use bundled code and libraries plus private scratch.
- Hiding `libnss3.so` prevents startup. No host fallback.
- Repeated fresh runs produce identical screenshot bytes on this machine.
- Host kernel still used. ARM64 and different host distributions not tested.
- Bubblewrap and the supplied Playwright package are operator-provided here;
  this probe is not a fully pinned toolchain or a security audit.

Next: validate on another Linux distribution and ARM64; trace broader workloads,
including fonts, media, subprocesses, and DNS behavior. Then integrate through
an existing Bazel execution mechanism with a pinned runner and declared inputs,
outputs, cleanup, and cache identity. Do not turn this script into another runtime
framework or silently change host mode.
