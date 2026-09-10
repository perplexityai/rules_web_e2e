# Development and releases

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
`bazelisk test //...`. Run `bazelisk test //...` inside [`bcr_test/`](../bcr_test/) to test
the module as a dependency. CI runs both workspaces with Bazel 9.2.0 and
8.6.0 on Linux and macOS. Local overrides belong in `.bazelrc.user`.

Lefthook validates Conventional Commit messages, for example
`feat: add browser test rule` or `fix: resolve test runfiles`.
CI also validates pull request titles and commits. Use a conventional title
for squash merges so Release Please can determine the next version.

## Release automation

Release Please maintains a PR updating `version.txt`, `CHANGELOG.md`, and
`.release-please-manifest.json`. Merging it creates a version tag. The module
release workflow builds an attested archive, publishes it to GitHub Releases,
and submits a BCR update. See the [workflow](../.github/workflows/module_release.yaml)
and [BCR configuration](../.bcr/config.yml) for publishing destinations.

`MODULE.bazel` retains the development version `0.0.0`; publishing patches it
to the release version. The archive prefix is `rules_web_e2e-X.Y.Z`.

Maintainers configure these Actions secrets with access to this repository:

- `GH_RELEASE_TOKEN`: a PAT with repository access and Contents, Pull requests,
  and Issues write permissions. A PAT lets generated tags trigger downstream workflows.
- `BCR_PUBLISH_TOKEN`: the token for the configured registry fork and
  [publish-to-bcr integration](https://github.com/bazel-contrib/publish-to-bcr#a-note-on-release-automation).

Prepare an archive locally for an existing tag:

```sh
.github/workflows/release_prep.sh v0.1.0 > release_notes.txt
```

The `module-release` workflow accepts an existing tag through manual dispatch
for retries. Running the local preparation script does not publish a release.
