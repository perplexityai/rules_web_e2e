# Testcontainers 12.1.0 execution guard

The pnpm-locked patch adds opt-in `TESTCONTAINERS_PRELOADED_IMAGES_ONLY=true`.
`startBrowser` sets it for the rules' private runtime process:

- Image startup inspects local image availability and returns without registry
  authentication or pulls, including if an image disappears after preflight.
- Existing Ryuk containers are inspected before opening a cleanup connection.
  Docker's actual container image ID must equal the locally resolved pinned image
  ID. Cached reapers are checked too. Unverifiable or mismatched identities fail;
  foreign reapers are never stopped by this check.

This patches the pinned package rather than replacing its cleanup lifecycle or
monkey-patching shared client methods. Default Testcontainers behavior is unchanged
when the flag is absent. Revisit the patch on dependency upgrades; upstream support
for these policies can replace it. Real-daemon coverage lives in
`runtime/preload-browser.test.ts` and the React example's `preloaded_vrt_test`.
