# Updating the Linux system preset

This maintenance workspace resolves Ubuntu dependencies with `rules_distroless`.
Consumers use the exported URLs/checksums, so their builds do not run APT resolution.

To create a new preset, update the snapshot and package seeds in `MODULE.bazel`,
then run from the repository root:

```sh
(cd tools/runtime-preset && bazelisk mod deps)
bazelisk run //tools:update_runtime_preset -- \
  "$PWD/tools/runtime-preset/MODULE.bazel.lock" \
  "$PWD/playwright/presets/noble_20260901.json"
```

Use a new dated preset name when changing a published preset; update its target
and extension wiring accordingly. Review package/version/checksum changes and run
both the production VM suite and consumer screenshot comparisons. The exporter
omits DejaVu's alternative font packages to retain the established Liberation
font policy. Chromium and Node versions are independent caller-owned downloads.
