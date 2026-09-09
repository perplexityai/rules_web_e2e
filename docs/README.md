# Browser testing documentation

`rules_web_e2e` supplies Bazel execution and screenshot lifecycle management;
consumers supply the application, test cases, styling, and fixtures.

| Document                                                  | Read it for                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Architecture](architecture.md)                           | Ownership boundaries, TypeScript, runfiles, and browser execution.                    |
| [Testcontainers and VRT stability](testcontainers-vrt.md) | Reproducible rendering, lifecycle, isolation, and the Testcontainers runtime adapter. |
| [Visual testing design](visual-testing-design.md)         | Determinism, baseline ownership, artifacts, and reusable visual cases.                |
| [Component VRT guide](component-vrt.md)                   | Working setup, commands, and supported versions.                                      |
| [Delivery plan](oss-browser-testing-plan.md)              | Proposed Playwright, web E2E, and component browser APIs.                             |

See also [custom servers and UI shells](customization.md) and
[dependency versions](dependencies.md).

## Implementation status

Component VRT is implemented with strict TypeScript, Playwright Test, and
Playwright Chromium in a pinned Linux container. The [React example](../examples/react)
is a standalone consumer and runs in a dedicated CI job.

The generic Playwright wrapper, managed-server web E2E, direct component browser
rule, page VRT, and reusable visual-module API are planned. Design descriptions
for those features are proposals, not currently available entrypoints.
