# Dependency versions

Pins come from [package.json](../package.json), [MODULE.bazel](../MODULE.bazel),
[the React example](../examples/react/package.json), and [CI](../.buildkite/pipeline.yml).
Lockfiles pin transitive dependencies.

| Dependency | Version |
| ---------------------------------------- | ----------------------------------------- |
| Playwright Test / client | 1.63.0 |
| Example build: Vite / React plugin | 8.2.2 / 6.1.1 |
| TypeScript | 7.0.2 |
| React / React DOM in standalone example | 19.2.8 |
| Node / React / React DOM types | 26.5.0 / 19.2.18 / 19.2.7 |
| pnpm / lefthook | 12.3.4 / 2.1.12 |
| commitlint CLI / types | 21.2.2 / 21.2.0 |
| Bazel | 9.2.0; CI also checks 8.6.0 compatibility |
| rules_js / rules_ts | 3.4.1 / 3.10.1 |
| bazel_lib / rules_shell | 3.7.2 / 0.8.0 |
| Runtime mrmime | 2.0.1 |
| Tool runfiles / fflate / tar | 6.5.0 / 0.8.3 / 7.5.22 |
| tar.bzl / Bubblewrap | 0.10.4 / 0.13.0.bcr.1 |
| Browser preset Chromium / Node | 153.0.8010.12 / 24.14.0 |
| Browser / system preset release | 20260921 / Noble 20260901 |
| Worker actiond release | 0.0.7 |

Callers select a versioned preset or checksum-pinned runtime archives. Keep browser and npm
versions synchronized and compare reviewed screenshots after upgrades. pnpm 12's
release-age exceptions name only exact recent releases selected here.

Runtime has no React dependency. Consumers own their framework versions,
plugins, lockfiles, and strict TypeScript configuration. React example
tested integration; other frameworks must implement gallery renderer
and validate their own compatibility.

See [Renovate maintenance](renovate.md) for automated groups and coordinated upgrades.
