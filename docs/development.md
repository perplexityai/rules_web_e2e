# Development and releases

Install [Bazelisk](https://github.com/bazelbuild/bazelisk), Node.js 24+, and
pnpm version pinned in `package.json` (Corepack can select it automatically).

```sh
pnpm install --frozen-lockfile
pnpm hooks:install
pnpm build
pnpm test
pnpm test:bcr
```

Corresponding Bazel commands `bazelisk build //...` and
`bazelisk test //...`. Run `bazelisk test //...` inside [`bcr_test/`](../bcr_test/) to test
module as dependency. CI runs both workspaces with Bazel 9.2.0 and
8.6.0 on Linux and macOS. Local overrides belong in `.bazelrc.user`.

Lefthook validates Conventional Commit messages, for example
`feat: add browser test rule` or `fix: resolve test runfiles`.
CI also validates pull request titles and commits. Use conventional title
for squash merges so Release Please can determine next version.

## Release automation

Release Please maintains PR updating `version.txt`, `CHANGELOG.md`, and
`.release-please-manifest.json`. Merging it creates version tag. Module
release workflow builds attested archive, publishes it to GitHub Releases,
and submits BCR update. See [workflow](../.github/workflows/module_release.yaml)
and [BCR configuration](../.bcr/config.yml) for publishing destinations.

`MODULE.bazel` retains development version `0.0.0`; publishing patches it
to release version. Archive prefix `rules_web_e2e-X.Y.Z`.

Maintainers configure these Actions secrets with access to this repository:

- `GH_RELEASE_TOKEN`: PAT with repository access and Contents, Pull requests,
  and Issues write permissions. PAT lets generated tags trigger downstream workflows.
- `BCR_PUBLISH_TOKEN`: token for configured registry fork and
  [publish-to-bcr integration](https://github.com/bazel-contrib/publish-to-bcr#a-note-on-release-automation).

Prepare archive locally for existing tag:

```sh
.github/workflows/release_prep.sh v0.1.0 > release_notes.txt
```

`module-release` workflow accepts existing tag through manual dispatch
for retries. Running local preparation script does not publish release.
