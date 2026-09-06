# Component visual regression tests

`component_visual_test` runs consumer-owned Vitest browser tests against a
Playwright server in a digest-pinned Linux container. It provides comparison,
failure artifacts, and an explicit `<name>.update` target. The runtime is consumed
through Bazel; a separate npm publication is not required.

## Try the standalone example

Install Bazelisk and Docker, start a local Docker daemon, then:

```sh
cd examples/react
bazelisk test //:visual_test
bazelisk run //:visual_test.update
```

Bazel installs the locked npm dependencies. The update command replaces this
example’s PNG baselines only after every test succeeds. Review the image diff
before committing. Each VRT target must own a separate baseline directory.

## Consumer setup

1. Add `rules_web_e2e` to `MODULE.bazel`. During development use a
   `local_path_override` pointing to your checkout; use a published version when
   available. Translate the consumer’s npm lockfile with `rules_js`.
2. Link `@rules_web_e2e//runtime:package` with `npm_link_package` as
   `node_modules/@rules-web-e2e/vrt`. Provide a consumer `vitest_binary` and the
   `node_modules/playwright-core/dir` target.
3. Define `component_visual_test` with `config`, `srcs`, `deps`, and `data`.
   List existing PNGs in `baselines` and set `baseline_dir` (default:
   `__screenshots__`). Config and baselines belong to the consumer repository.
   Use `js_library` for cross-package source inputs so they enter the Bazel
   output tree. See [the complete BUILD example](../examples/react/BUILD.bazel).
4. Import `visualConfig` from `@rules-web-e2e/vrt` and merge it with your Vite
   plugins, aliases, and test include patterns. Pass the `playwright` provider
   from `@vitest/browser-playwright` and an absolute `root` derived from the
   config file. Call `expect(element).toMatchScreenshot('stable-name')`
   in the browser test; screenshot names are simple filenames.

Consumers own React providers, CSS, fixtures, TypeScript checking, and CI
scheduling. The macro does not add a typecheck target. The helper sets a 1280×720
viewport, light theme, reduced motion, en-US locale, UTC timezone, and zero
allowed mismatched pixels by default; configure `viewport` and `tolerance`
explicitly when needed. Wait for loaded data and fonts with polling assertions
before taking a one-shot screenshot. Vitest 4.1.6 screenshot failures inside
`expect.element` polling can time out instead of reporting the image diff.

## Execution contract

- Tested versions: Bazel 9.0/9.2, Vitest/browser provider 4.1.6, Playwright/core
  1.62.0, Vite 8.1.0, React 17.0.2. Initial screenshot support is Linux amd64.
  macOS/arm64 screenshot equivalence has not been validated.
- The image, including fonts and browser binaries, is pinned by digest. Its
  Playwright version must match the consumer’s `playwright-core` package.
  The runner copies that declared package into the container; it does not run
  npm installs or mount source paths inside Docker.
- Docker must be on PATH and its local daemon reachable. Docker connection
  variables are inherited explicitly. Browser traffic reaches the host Vite
  server through Playwright’s loopback forwarding.
- Each invocation owns and cleans up one container. Tests run locally, outside
  Bazel’s filesystem sandbox, and disable result caching. Docker/browser tests
  are `manual`; invoke them explicitly in a dedicated CI job.
- Compare mode copies declared baselines to a temporary directory. Missing or
  changed screenshots fail without modifying source baselines. Vitest writes
  JUnit and image attachments under `TEST_UNDECLARED_OUTPUTS_DIR`.
- Update mode captures into a fresh directory, then synchronizes PNGs into the
  source directory, removing stale PNGs and retaining other files. It rejects
  empty captures, path traversal, directory symlinks, and CLI filters. Do not
  run concurrent updates against the same baseline directory.
- `execution_timeout_seconds` bounds runner execution (default: 180 seconds);
  Bazel’s `timeout` independently bounds the test. Failed updates leave existing
  baselines intact and print the artifact directory.

Vitest 4’s control channels need an early, synchronous bridge between its
orchestrator and test iframe under this setup. The helper installs it only for
`vitest:*` channels; application channels remain native. The standalone browser
example exercises this integration.
