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

See [end-to-end tests](e2e.md) for click/navigation specs.

See also [custom servers and UI shells](customization.md) and
[dependency versions](dependencies.md).

## Implementation status

Component VRT is implemented with strict TypeScript, Playwright Test, and
Playwright Chromium in a pinned Linux container. The [React example](../examples/react)
is a standalone consumer and runs in a dedicated CI job.

Managed-server web E2E is implemented with native Playwright specs and the shared
server/container runtime. Direct component mounting, page VRT conventions, and
reusable visual-module APIs remain planned. Design descriptions
for those features are proposals, not currently available entrypoints.
