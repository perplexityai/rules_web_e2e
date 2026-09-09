# Dependency versions

Verified against npm and the Bazel Central Registry on 2026-09-09. Direct npm
versions are exact pins; lockfiles pin transitive dependencies.

| Dependency                               | Version                                   |
| ---------------------------------------- | ----------------------------------------- |
| Playwright Test / client / browser image | 1.63.0                                    |
| Testcontainers                           | 12.1.0                                    |
| Vite / React plugin                      | 8.2.2 / 6.1.1                             |
| TypeScript                               | 7.0.2                                     |
| React / React DOM in standalone example  | 19.2.8                                    |
| Node / React / React DOM types           | 26.5.0 / 19.2.18 / 19.2.7                 |
| pnpm / lefthook                          | 12.3.4 / 2.1.12                           |
| commitlint CLI / types                   | 21.2.2 / 21.2.0                           |
| Bazel                                    | 9.2.0; CI also checks 8.6.0 compatibility |
| rules_js / rules_ts                      | 3.4.1 / 3.10.1                            |
| bazel_lib / rules_shell                  | 3.7.2 / 0.8.0                             |

The Playwright image pins its Linux amd64 manifest digest. Keep image and npm
versions synchronized and compare reviewed screenshots after upgrades. pnpm 12's
release-age exceptions name only the exact recent releases selected here.

Consumer compatibility remains explicit: FormatJS's legacy Material UI 4 editor
requires React 17 and a compatible react-intl release. Its root build also owns a
patched rules_ts override. The runtime supports those consumer choices without
forcing their versions on standalone consumers.

The legacy react-intl package declares TypeScript 4/5 peers. The editor is
validated with its monorepo TypeScript 7 compiler; this remains a known consumer
peer-range mismatch, not a runtime dependency of the OSS package.
