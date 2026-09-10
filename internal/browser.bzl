"""Shared implementation of managed-server E2E and visual test targets."""

load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_library", "js_test")

PLAYWRIGHT_IMAGE = "mcr.microsoft.com/playwright:v1.63.0-noble@sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7"

def browser_test(
        name,
        playwright_test,
        playwright_core,
        config,
        srcs,
        visual = False,
        vite = None,
        server_config = None,
        server = None,
        base_url = None,
        base_url_env = None,
        deps = [],
        data = [],
        baselines = [],
        baseline_dir = "__screenshots__",
        image = PLAYWRIGHT_IMAGE,
        playwright_version = "1.63.0",
        env = {},
        env_inherit = [],
        network_origins = [],
        tags = [],
        timeout = "long",
        execution_timeout_seconds = 180):
    """Run Playwright Test specs against a pinned Linux Playwright server.

    playwright_test is a consumer-owned @playwright/test package directory. playwright_core is the matching
    npm_link_package /dir target. config and all imports must be declared
    in srcs/deps/data. The generated <name>.update binary owns baseline_dir:
    it replaces its PNG files only after a successful full capture.

    Args:
        name: Test target name.
        visual: Enable screenshot policy and create <name>.update.
        playwright_test: Consumer @playwright/test npm /dir target.
        playwright_core: Matching playwright-core npm /dir target.
        config: Consumer Playwright Test config file.
        vite: Consumer Vite npm /dir target.
        server_config: Consumer Vite config file; required with vite.
        server: Compiled TS module exporting a ServerAdapter; replaces the Vite adapter.
        base_url: Existing HTTP(S) application URL; no server is started or stopped.
        base_url_env: Environment variable containing an existing application URL.
        srcs: Browser test sources.
        deps: Runtime npm and library dependencies.
        data: Other declared source files and assets.
        baselines: Existing PNG inputs, usually a glob under baseline_dir.
        baseline_dir: Package-relative directory owned by this target.
        image: Public Linux Playwright image pinned by digest.
        playwright_version: Version installed in the image.
        env: Additional environment values for the runner.
        env_inherit: Additional explicitly inherited environment names.
        network_origins: Additional explicit HTTP(S) origins exposed through the browser tunnel.
        tags: Additional Bazel test tags.
        timeout: Bazel test timeout category.
        execution_timeout_seconds: Limit for the Playwright Test child process.
    """
    if execution_timeout_seconds <= 0:
        fail("execution_timeout_seconds must be positive")
    if not baseline_dir or baseline_dir.startswith("/") or any([p in ["", ".", ".."] for p in baseline_dir.split("/")]):
        fail("baseline_dir must be a nonempty relative directory without dot segments")
    if "@sha256:" not in image:
        fail("image must be pinned by digest")
    modes = [server != None, vite != None or server_config != None, base_url != None, base_url_env != None]
    if len([mode for mode in modes if mode]) != 1:
        fail("Supply exactly one of server, vite/server_config, base_url, or base_url_env")
    server_inputs = []
    server_env = {}
    if base_url != None:
        if not base_url:
            fail("base_url must not be empty")
        server_env = {"VRT_BASE_URL": base_url}
    elif base_url_env != None:
        if not base_url_env or base_url_env.startswith("VRT_"):
            fail("base_url_env must be a nonempty consumer environment name")
        server_env = {"VRT_BASE_URL_ENV": base_url_env}
        if base_url_env not in env and base_url_env not in env_inherit:
            env_inherit = env_inherit + [base_url_env]
    elif server:
        server_inputs = [server]
        server_env = {"VRT_CUSTOM_SERVER": "$(rlocationpath %s)" % server}
    elif vite and server_config:
        server_inputs = [vite, server_config]
        server_env = {
            "VRT_VITE": "$(rlocationpath %s)" % vite,
            "VRT_SERVER_CONFIG": "$(rlocationpath %s)" % server_config,
        }
    else:
        fail("Supply a nonempty server or both vite and server_config")
    js_library(
        name = name + "_sources",
        srcs = srcs + [config] + ([server_config] if server_config else []) + baselines,
        data = data,
        deps = deps,
    )
    common = dict(
        copy_data_to_bin = False,
        entry_point = Label("//runtime:runner_entry"),
        data = server_inputs + [playwright_test, playwright_core, config, ":" + name + "_sources", Label("//runtime:files")],
        env = env | {
            "VRT_BASE_URL": "",
            "VRT_BASE_URL_ENV": "",
            "VRT_CUSTOM_SERVER": "",
        } | server_env | {
            "VRT_PLAYWRIGHT_TEST": "$(rlocationpath %s)" % playwright_test,
            "VRT_PLAYWRIGHT_CORE": "$(rlocationpath %s)" % playwright_core,
            "VRT_CONFIG": "$(rlocationpath %s)" % config,
            "VRT_MODE": "visual" if visual else "e2e",
            "VRT_BASELINE_RELATIVE": _paths_join(native.package_name(), baseline_dir) if visual else "",
            "VRT_NETWORK_ORIGINS": json.encode(network_origins),
            "VRT_ENV_NAMES": json.encode(env.keys() + env_inherit),
            "VRT_TIMEOUT_MS": str(execution_timeout_seconds * 1000),
            "VRT_IMAGE": image,
            "VRT_PLAYWRIGHT_VERSION": playwright_version,
        },
    )
    js_test(
        name = name,
        env_inherit = ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_CONFIG"] + env_inherit,
        tags = ["manual", "external", "visual_test" if visual else "e2e_test", "requires-network", "no-sandbox", "no-remote", "no-cache"] + tags,
        timeout = timeout,
        **common
    )
    if visual:
        js_binary(
            name = name + ".update",
            fixed_args = ["--update"],
            tags = ["manual"] + tags,
            **common
        )

def _paths_join(package, directory):
    return package + "/" + directory if package else directory
