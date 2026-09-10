# End-to-end tests

`web_e2e_test` runs ordinary Playwright specs against a managed or existing application server.
Write clicks, navigation, form interactions, and assertions with `@playwright/test`.
No screenshot baseline or `.update` target is required.

```ts
import {expect, test} from '@playwright/test'

test('saves a draft', async ({page}) => {
  await page.goto('/')
  await page.getByRole('textbox', {name: 'Title'}).fill('My draft')
  await page.getByRole('button', {name: 'Save'}).click()
  await expect(page.getByText('Draft saved')).toBeVisible()
})
```

## Setup

Compile `*.spec.ts` with strict typechecking and declare its runtime dependencies.
Pass the resulting target and a compiled server adapter to `web_e2e_test`:

```starlark
load("@rules_web_e2e//e2e:defs.bzl", "web_e2e_test")

web_e2e_test(
    name = "e2e_test",
    tests = ":compiled_specs",
    server = ":app_test_server",
)
```

Alternatively supply a built `shell` or an existing URL. See the
[setup guide](getting-started.md) and [all attributes](api.md).
The runner selects emitted `*.spec.js`, excluding component/visual specs.
It supplies `baseURL` and `VRT_APP_URL`; use `page.goto('./')` to preserve a
server base path. Most consumers need no Playwright config. Pass an optional
compiled config for custom fixtures, timeouts, global setup, or E2E projects.

```sh
# Standalone example
cd examples/react
bazel test //:e2e_test
bazel test //:e2e_test --test_arg=--grep=save
```

Selection flags `--grep`, `--grep-invert`, `--project`, and `--shard` are forwarded
through `--test_arg`. Configure other Playwright settings in the declared config;
CLI overrides of config, reporters, output paths, and snapshot updates are rejected.
No matching tests fail by default. Visual targets keep their separate full-capture
policy. See [the example BUILD file](../examples/react/BUILD.bazel).

## Execution and larger applications

```mermaid
flowchart LR
  Target[Bazel E2E target] --> Inputs[Declared server, app, specs and fixtures]
  Inputs --> Runtime[Shared browser runtime]
  Runtime --> Server[Consumer server adapter]
  Runtime --> Tests[Native Playwright Test]
  Tests --> Browser[Pinned Testcontainers browser]
  Browser -->|Allowed fixture endpoint| Server
  Tests --> Results[JUnit, failure screenshots and traces]
```

The server adapter can coordinate an existing dev server and local test services,
returning one ready frontend URL and a cleanup callback. UI shells, provider setup,
route registries, and framework conventions remain in the consuming repository.
Page objects and `test.extend` fixtures work normally. Prefer `page.route` or local
fixture APIs for deterministic data; declare any authentication state files in
`data`. Keep credentials in explicitly declared environment variables rather
than checked-in state. Additional browser service origins require `network_origins`.

Like VRT, E2E is manual, local, uncached, and requires a local Docker daemon.
Server processes and browser resources are cleaned up after completion. Failures
return a nonzero status and preserve JUnit, screenshots, and traces in Bazel's
undeclared outputs. The host test process (including Playwright's `request`
fixture), custom server code, and setup scripts remain trusted and unsandboxed;
browser network restrictions do not sandbox Node requests. Remote endpoints are caller-owned; automatic backend provisioning and authentication
conventions remain consumer responsibilities.

## Existing application URLs

Choose exactly one endpoint source: `server`, `shell`,
`base_url`, or `base_url_env`. For a deployed app, replace the server attributes:

```starlark
web_e2e_test(
    name = "deployed_test",
    base_url_env = "TEST_APP_URL",
    tests = ":compiled_specs",
    network_origins = ["https://auth.example.test"],
)
```

```sh
bazel test //path:deployed_test --test_env=TEST_APP_URL=https://preview.example.test/app/
```

`base_url_env` explicitly inherits that one variable; an unset or empty value
fails. For a fixed endpoint use `base_url = "https://preview.example.test/app/"`.
HTTP(S) paths and queries are preserved; credentials, fragments, and wildcard
hosts are rejected. Use `page.goto('./')` to retain a base path.

The runner starts no app process, performs no provisioning or health-check login,
and never stops the endpoint. Specs or consumer setup own readiness and auth.
Browser traffic is tunneled through the runner host, so that host must have the
required DNS/VPN access. The endpoint's host and port are allowed automatically;
redirects, API hosts, and identity providers need explicit `network_origins`.
Supply credentials through declared environment or private generated inputs.

The pinned browser, staged specs, clean environment, and artifacts are unchanged.
Live data and remote deployments are external inputs, so these tests remain
uncached and do not promise reproducible application state. The same endpoint
options work with VRT, whose `.update` remains explicit.

`//:remote_integration_test` in the React example starts an independent fixture
on a random port and verifies base paths, interactions, blocked undeclared
origins, and caller-owned server lifetime. CI needs no public test site.
