# Dependency updates

[renovate.json](../renovate.json) configures the hosted Renovate app for npm/pnpm,
Bzlmod, Bazel versions, source archives, and GitHub Actions. Examples and the
end-to-end workspace are included. Releases wait seven days; major upgrades
need Dependency Dashboard approval. PRs use Conventional Commits and require review.

TypeScript npm packages and Bazel `ts_version` declarations update together.
React, commitlint, and Bazel versions have their own groups. pnpm lockfiles follow
npm updates. This repo does not commit `MODULE.bazel.lock` files.

These upgrades remain coordinated maintenance:

- Playwright, its default runtime version, and new checksum-pinned browser presets.
  Published preset manifests remain immutable; validate captures and review baselines.
- Worker manifests and source pins; update browser-action `worker_sha256` identities.
- Patched test-tool archives and their BCR overlays.
- Checksum-pinned bootstrap binaries and the Bazel compatibility CI matrix.

Reusable release workflows retain version tags for BCR provenance; ordinary
GitHub Actions retain SHA pins. Local consumers' `rules_web_e2e` dependencies
continue to use `local_path_override`.

## Activate

Grant the [Renovate GitHub app](https://github.com/apps/renovate) access to this
repository. In Mend's repository dependency settings, enable automated PRs and
disable silent mode for this repo. Merge the config; no workflow token is needed.
Organization silent mode can otherwise prevent PR creation.

## Validate

```sh
npx --yes --package renovate -- renovate-config-validator --strict
```
