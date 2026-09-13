# Testcontainers 12.1.0 execution guard

The pnpm-locked patch combines two independent changes, enabled by `startBrowser`
in the rules' private runtime process:

- `TESTCONTAINERS_PULL_POLICY=never` uses the implementation submitted in
  [testcontainers-node#1457](https://github.com/testcontainers/testcontainers-node/pull/1457)
  (commit `42c7675`). The image-client and utility hunks are the exact compiled
  output of that upstream commit (`npm run build -w testcontainers`). Image startup
  inspects local availability and returns without registry authentication or pulls,
  including if an image disappears after preflight. Both pull paths are covered.
- `TESTCONTAINERS_PRELOADED_IMAGES_ONLY=true` retains our separate Ryuk identity
  check. Existing containers are inspected before opening a cleanup connection.
  Docker's actual container image ID must equal the locally resolved pinned image
  ID. Cached reapers are checked too. Unverifiable or mismatched identities fail;
  foreign reapers are never stopped by this check.

This patches the pinned package rather than replacing its cleanup lifecycle or
monkey-patching shared client methods. Default Testcontainers behavior is unchanged
when the flags are absent. Replace the upstream hunks with a released dependency
once available; retain the Ryuk check until upstream supports identity verification.
Real-daemon coverage lives in `runtime/preload-browser.test.ts` and the React
example's `preloaded_vrt_test`.
