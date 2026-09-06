# rules_web_e2e

Bazel module scaffold for web end-to-end testing rules. The build, release,
Bazel Central Registry (BCR), and commit-hook setup follows
[perplexityai/gazelle_py](https://github.com/perplexityai/gazelle_py).
Browser testing rules are not implemented yet; the smoke tests verify module
packaging and consumption from a separate Bazel workspace.

## Development

Install [Bazelisk](https://github.com/bazelbuild/bazelisk), Node.js 24+, and
the pnpm version pinned in `package.json` (Corepack can select it automatically).

```sh
pnpm install --frozen-lockfile
pnpm hooks:install
pnpm build
pnpm test
pnpm test:bcr
```

The corresponding Bazel commands are `bazelisk build //...` and
`bazelisk test //...`. Run `bazelisk test //...` inside `bcr_test/` to test
the module as a dependency. CI runs both workspaces with Bazel 9.0.0 and
8.6.0 on Linux and macOS. Local overrides belong in `.bazelrc.user`.

Lefthook validates Conventional Commit messages, for example
`feat: add browser test rule` or `fix: resolve test runfiles`.
CI also validates pull request titles and commits. Use a conventional title
for squash merges so Release Please can determine the next version.

## Releases and BCR publishing

Release Please runs on `main` and maintains a release PR containing
`version.txt`, `CHANGELOG.md`, and `.release-please-manifest.json`.
Merging that PR creates a `vX.Y.Z` tag. The module release workflow tests
the repo, produces an attested `rules_web_e2e-vX.Y.Z.tar.gz` archive, publishes
a GitHub release, and submits the version to BCR through
`perplexityai/bazel-central-registry`.

`MODULE.bazel` keeps the development version `0.0.0`; the BCR publisher patches
it to the release version. The archive prefix is `rules_web_e2e-X.Y.Z`, matching
`.bcr/source.template.json`. BCR builds and tests the separate `bcr_test/`
consumer on Linux and macOS with Bazel 8 and 9.

Configure the same repository integrations as `gazelle_py` before releasing:

- `GH_RELEASE_TOKEN`: a token with permission to create release PRs and tags.
  A PAT allows those tags to trigger the module release workflow.
- `BCR_PUBLISH_TOKEN`: the publishing token required by
  [publish-to-bcr](https://github.com/bazel-contrib/publish-to-bcr#a-note-on-release-automation).
- The `perplexityai/bazel-central-registry` fork and the publish-to-bcr GitHub
  App installation on that fork.
- `.bcr/config.yml` uses `longlho` as the releaser. The maintainers in
  `.bcr/metadata.template.json` are `longlho`, `pplx-oss`, and `dan-pplx`.

To prepare an archive locally for an existing tag:

```sh
.github/workflows/release_prep.sh v0.1.0 > release_notes.txt
```

The `module-release` workflow also accepts an existing tag through manual
dispatch, allowing a release to be retried. Publishing requires the integrations
above; creating this scaffold does not publish a release.
