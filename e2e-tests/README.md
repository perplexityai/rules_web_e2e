# Isolated end-to-end tests

The tests in this directory consume the public browser rules from `actiond/workspace/`, a separate Bazel module with its own BUILD,
lockfile, application, browser specs, and checked-in screenshot fixtures.
No test imports private runtime functions. Harnesses copy the module to a
disposable directory with a separate Bazel output base; source baselines stay
unchanged. JavaScript and TypeScript fixtures are real source files.

## Host browsers

Install the Chromium version pinned in the root package.json, then run:

```sh
python3 e2e-tests/run-host.py
```

Set `PLAYWRIGHT_BROWSERS_PATH` when using a nondefault browser installation and
`BAZEL` when the executable is not `bazelisk`. This runs page interaction,
component interaction, and native Playwright configuration through public Bazel
test targets. Test-result caching is disabled. `E2E_TEST_ARTIFACTS` optionally
retains Bazel logs and browser artifacts after the temporary workspace is removed.
CI runs this on Linux and macOS and uploads the results, including on failure.

## Isolated Linux VM

See [the VM harness](actiond/README.md) and [consumer commands](actiond/workspace/README.md).
The production CI lane runs real Chromium inside the published actiond worker.
One consumer and worker cover compatible scenarios: browser execution, retries,
screenshot capture/compare, failure artifacts, baseline preservation, and recovery.
Each regression keeps its own assertions, and recovery runs use uncached actions.
The macOS ARM64 lane builds the consumer's remote inputs and worker.

PR-specific regressions extend this shared consumer rather than creating copies
of the application. Where present, `host-temp-paths.py` exercises deep and
symlinked Chromium temp roots, and `release-consumer.py` packages a local candidate
release and runs the consumer against its archive. Both are wired into CI.
