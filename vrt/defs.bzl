"""Bazel component screenshot comparison and explicit baseline updates."""

load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_library", "js_test")

PLAYWRIGHT_IMAGE = "mcr.microsoft.com/playwright:v1.62.0-noble@sha256:baed2032d533817f3dbe6425de795788430ba345e819a1201337009ba17c9d07"

def component_visual_test(
        name,
        runner,
        playwright_core,
        config,
        server,
        server_config,
        srcs,
        deps = [],
        data = [],
        baselines = [],
        baseline_dir = "__screenshots__",
        image = PLAYWRIGHT_IMAGE,
        playwright_version = "1.62.0",
        env = {},
        env_inherit = [],
        tags = [],
        timeout = "long",
        execution_timeout_seconds = 180):
    """Run Playwright Test specs against a pinned Linux Playwright server.

    runner is a consumer-owned playwright_binary. playwright_core is the matching
    npm_link_package /dir target. config and all imports must be declared
    in srcs/deps/data. The generated <name>.update binary owns baseline_dir:
    it replaces its PNG files only after a successful full capture.

    Args:
        name: Compare target name; also creates <name>.update.
        runner: Consumer playwright_binary target.
        playwright_core: Matching playwright-core npm /dir target.
        config: Consumer Playwright Test config file.
        server: Consumer Vite binary target.
        server_config: Consumer Vite config file.
        srcs: Browser test sources.
        deps: Runtime npm and library dependencies.
        data: Other declared source files and assets.
        baselines: Existing PNG inputs, usually a glob under baseline_dir.
        baseline_dir: Package-relative directory owned by this target.
        image: Public Linux Playwright image pinned by digest.
        playwright_version: Version installed in the image.
        env: Additional environment values for the runner.
        env_inherit: Additional explicitly inherited environment names.
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
    js_library(
        name = name + "_sources",
        srcs = srcs + [config, server_config] + baselines,
        data = data,
        deps = deps,
    )
    common = dict(
        copy_data_to_bin = False,
        entry_point = Label("//runtime:runner_entry"),
        data = [runner, playwright_core, config, server, server_config, ":" + name + "_sources", Label("//runtime:files")],
        env = env | {
            "VRT_RUNNER": "$(rlocationpath %s)" % runner,
            "VRT_PLAYWRIGHT_CORE": "$(rlocationpath %s)" % playwright_core,
            "VRT_CONFIG": "$(rlocationpath %s)" % config,
            "VRT_SERVER": "$(rlocationpath %s)" % server,
            "VRT_SERVER_CONFIG": "$(rlocationpath %s)" % server_config,
            "VRT_BASELINE_RELATIVE": _paths_join(native.package_name(), baseline_dir),
            "VRT_TIMEOUT_MS": str(execution_timeout_seconds * 1000),
            "VRT_IMAGE": image,
            "VRT_PLAYWRIGHT_VERSION": playwright_version,
        },
    )
    js_test(
        name = name,
        env_inherit = ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_CONFIG"] + env_inherit,
        tags = ["manual", "external", "visual_test", "requires-network", "no-sandbox", "no-remote", "no-cache"] + tags,
        timeout = timeout,
        **common
    )
    js_binary(
        name = name + ".update",
        fixed_args = ["--update"],
        tags = ["manual"] + tags,
        **common
    )

def _paths_join(package, directory):
    return package + "/" + directory if package else directory
