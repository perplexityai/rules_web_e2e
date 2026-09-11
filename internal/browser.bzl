"""Execute compiled browser inputs with a reusable Playwright runtime."""

load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_library", "js_test")
load("//playwright:defs.bzl", "PlaywrightInfo", "runfile", _PLAYWRIGHT_IMAGE = "PLAYWRIGHT_IMAGE")

PLAYWRIGHT_IMAGE = _PLAYWRIGHT_IMAGE
ShellInfo = provider(fields = ["directory", "entry_point"])

def _shell_impl(ctx):
    if not ctx.file.assets.is_directory:
        fail("shell assets must be a built directory target")
    entry = ctx.attr.entry_point
    if entry.startswith("/") or any([p in ["", ".", ".."] for p in entry.split("/")]) or not entry.endswith(".html"):
        fail("entry_point must be a relative HTML path without dot segments")
    return [
        DefaultInfo(files = depset([ctx.file.assets]), runfiles = ctx.runfiles(files = [ctx.file.assets]).merge(ctx.attr.assets[DefaultInfo].default_runfiles)),
        ShellInfo(directory = runfile(ctx.file.assets), entry_point = entry),
    ]

browser_shell = rule(
    implementation = _shell_impl,
    attrs = {
        "assets": attr.label(mandatory = True, allow_single_file = True),
        "entry_point": attr.string(default = "index.html"),
    },
)

def _compiled(target, label):
    if not target:
        return None
    files = [f for f in target[DefaultInfo].files.to_list() if f.extension in ["js", "mjs"]]
    if len(files) != 1 or files[0].is_source:
        fail(label + " must supply one compiled JavaScript module")
    return runfile(files[0])

def _inputs_impl(ctx):
    tests = [f for f in ctx.files.tests if f.basename.endswith(".spec.js")]
    if ctx.attr.mode == "component":
        tests = [f for f in tests if f.basename.endswith(".browser.spec.js")]
    elif ctx.attr.mode == "e2e":
        tests = [f for f in tests if not f.basename.endswith(".browser.spec.js") and not f.basename.endswith(".visual.spec.js")]
    if ctx.attr.mode != "visual" and (not tests or any([f.is_source for f in tests])):
        fail("tests must supply compiled JavaScript specs")
    runtime = ctx.attr.playwright[PlaywrightInfo]
    shell = ctx.attr.shell[ShellInfo] if ctx.attr.shell else None
    result = ctx.actions.declare_file(ctx.label.name + ".json")
    ctx.actions.write(result, json.encode({
        "tests": [runfile(f) for f in tests],
        "config": _compiled(ctx.attr.config, "config"),
        "matching": _compiled(ctx.attr.matching, "matching"),
        "server": _compiled(ctx.attr.server, "server"),
        "shell": {"directory": shell.directory, "entryPoint": shell.entry_point} if shell else None,
        "playwright": {"test": runtime.test, "core": runtime.core, "version": runtime.version, "image": runtime.image},
    }))
    inputs = ctx.runfiles(files = [result])
    for target in [ctx.attr.tests, ctx.attr.config, ctx.attr.matching, ctx.attr.server, ctx.attr.shell, ctx.attr.playwright, ctx.attr.sources]:
        if target:
            inputs = inputs.merge(target[DefaultInfo].default_runfiles)
            inputs = inputs.merge(ctx.runfiles(transitive_files = target[DefaultInfo].files))
            if OutputGroupInfo in target and hasattr(target[OutputGroupInfo], "transitive_typecheck"):
                inputs = inputs.merge(ctx.runfiles(transitive_files = target[OutputGroupInfo].transitive_typecheck))
    return [DefaultInfo(files = depset([result]), runfiles = inputs)]

_inputs = rule(
    implementation = _inputs_impl,
    attrs = {
        "tests": attr.label(),
        "config": attr.label(allow_files = True),
        "matching": attr.label(allow_files = True),
        "server": attr.label(allow_files = True),
        "shell": attr.label(providers = [ShellInfo]),
        "playwright": attr.label(providers = [PlaywrightInfo]),
        "sources": attr.label(),
        "mode": attr.string(),
    },
)

def browser_test(
        name,
        tests = None,
        server = None,
        shell = None,
        base_url = None,
        base_url_env = None,
        playwright = Label("//runtime:playwright"),
        config = None,
        matching = None,
        baselines = [],
        baseline_dir = "__screenshots__",
        data = [],
        env = {},
        env_inherit = [],
        network_origins = [],
        network_origins_env = [],
        tags = [],
        timeout = "long",
        execution_timeout_seconds = 180,
        args = [],
        visual = False,
        component = False):
    """Internal common implementation; public wrappers select the test mode."""
    if any([key.startswith("VRT_") for key in env.keys() + env_inherit + network_origins_env]):
        fail("VRT_* environment names are reserved for the browser runtime")
    if visual and component:
        fail("Visual and component modes are separate targets")
    if not visual and matching:
        fail("matching is only supported by visual targets")
    if execution_timeout_seconds <= 0:
        fail("execution_timeout_seconds must be positive")
    if not baseline_dir or baseline_dir.startswith("/") or any([p in ["", ".", ".."] for p in baseline_dir.split("/")]):
        fail("baseline_dir must be a nonempty relative directory without dot segments")
    sources = len([v for v in [server, shell, base_url, base_url_env] if v != None])
    if sources > 1 or (sources == 0 and not config):
        fail("Supply one of server, shell, base_url, base_url_env, or a config with use.baseURL")
    if base_url_env != None and (not base_url_env or base_url_env.startswith("VRT_")):
        fail("base_url_env must be a nonempty consumer environment name")
    if base_url == "":
        fail("base_url must not be empty")
    if base_url_env and base_url_env not in env and base_url_env not in env_inherit:
        env_inherit = env_inherit + [base_url_env]
    env_inherit = env_inherit + [key for key in network_origins_env if key not in env and key not in env_inherit]
    js_library(name = name + "_sources", srcs = baselines, data = data)
    _inputs(
        name = name + "_inputs",
        tests = tests,
        server = server,
        shell = shell,
        playwright = playwright,
        config = config,
        matching = matching,
        sources = ":" + name + "_sources",
        mode = "visual-spec" if visual and tests else "visual" if visual else "component" if component else "e2e",
    )
    common = dict(
        copy_data_to_bin = False,
        entry_point = Label("//runtime:runner_entry"),
        data = [":" + name + "_inputs", Label("//runtime:files")] + data,
        env = env | {
            "VRT_DESCRIPTOR": "$(rlocationpath :%s_inputs)" % name,
            "VRT_BASE_URL": base_url or "",
            "VRT_BASE_URL_ENV": base_url_env or "",
            "VRT_MODE": "visual-spec" if visual and tests else "visual" if visual else "component" if component else "e2e",
            "VRT_BASELINE_RELATIVE": (native.package_name() + "/" if native.package_name() else "") + baseline_dir if visual else "",
            "VRT_NETWORK_ORIGINS": json.encode(network_origins),
            "VRT_NETWORK_ORIGINS_ENV": json.encode(network_origins_env),
            "VRT_ENV_NAMES": json.encode(env.keys() + env_inherit),
            "VRT_TIMEOUT_MS": str(execution_timeout_seconds * 1000),
        },
    )
    js_test(
        name = name,
        args = args,
        env_inherit = ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_CONFIG"] + env_inherit,
        tags = ["manual", "external", "visual_test" if visual else "component_browser_test" if component else "e2e_test", "requires-network", "no-sandbox", "no-remote", "no-cache"] + tags,
        timeout = timeout,
        **common
    )
    if visual:
        js_binary(name = name + ".update", fixed_args = ["--update"], tags = ["manual"], **common)
