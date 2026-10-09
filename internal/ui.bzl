"""Aggregate browser suites for local Playwright development."""

load("@aspect_rules_js//js:defs.bzl", "js_binary")
load("@bazel_lib//lib:paths.bzl", "to_rlocation_path")
load("//playwright:defs.bzl", "PlaywrightInfo")

BrowserSuiteInfo = provider(fields = ["tests", "runfiles", "mode"])
_SuitesInfo = provider(fields = ["suites"])

def _suites_impl(target, ctx):
    if BrowserSuiteInfo in target:
        return [_SuitesInfo(suites = [target[BrowserSuiteInfo]])]
    suites = []
    dependencies = getattr(ctx.rule.attr, "data", [])
    if ctx.rule.kind == "test_suite":
        dependencies = dependencies + ctx.rule.attr.tests
    for dependency in dependencies:
        if _SuitesInfo in dependency:
            suites.extend(dependency[_SuitesInfo].suites)
    return [_SuitesInfo(suites = suites)]

_suites = aspect(implementation = _suites_impl, attr_aspects = ["data", "tests"])

def _inputs_impl(ctx):
    tests = []
    runfiles = ctx.runfiles()
    for target in ctx.attr.suites:
        suites = target[_SuitesInfo].suites
        if not suites:
            fail("suites must contain web_e2e_test targets directly or through test_suite: " + str(target.label))
        for suite in suites:
            if suite.mode != "e2e":
                fail("web_e2e_ui supports managed-server E2E suites only")
            tests.extend(suite.tests)
            runfiles = runfiles.merge(suite.runfiles)
    tests = depset(tests).to_list()
    if not tests:
        fail("suites must select at least one compiled spec")
    if ctx.attr.mode == "compiled":
        if not ctx.attr.config:
            fail("compiled mode requires an aggregate config")
        config_files = [file for file in ctx.files.config if file.extension in ["js", "mjs"]]
        if len(config_files) != 1 or config_files[0].is_source:
            fail("config must supply one compiled JavaScript module")
        config = to_rlocation_path(ctx, config_files[0])
        runfiles = runfiles.merge(ctx.attr.config[DefaultInfo].default_runfiles).merge(ctx.runfiles(files = ctx.files.config))
    else:
        if not ctx.file.source_config or not ctx.file.source_config.is_source or ctx.file.source_config.short_path.startswith("../"):
            fail("source mode requires a workspace source_config")
        config = ctx.file.source_config.short_path
    runtime = ctx.attr.playwright[PlaywrightInfo]
    manifest = ctx.actions.declare_file(ctx.label.name + ".json")
    ctx.actions.write(manifest, json.encode({
        "mode": ctx.attr.mode,
        "config": config,
        "tests": [to_rlocation_path(ctx, file) for file in tests],
        "playwright": runtime.test,
    }))
    for target in [ctx.attr.playwright] + ctx.attr.data:
        runfiles = runfiles.merge(target[DefaultInfo].default_runfiles).merge(ctx.runfiles(transitive_files = target[DefaultInfo].files))
    return [DefaultInfo(files = depset([manifest]), runfiles = runfiles.merge(ctx.runfiles(files = [manifest])))]

_inputs = rule(
    implementation = _inputs_impl,
    attrs = {
        "suites": attr.label_list(mandatory = True, aspects = [_suites]),
        "config": attr.label(allow_files = True),
        "source_config": attr.label(allow_single_file = True),
        "mode": attr.string(default = "compiled", values = ["compiled", "source"]),
        "playwright": attr.label(mandatory = True, providers = [PlaywrightInfo]),
        "data": attr.label_list(allow_files = True),
    },
)

def web_e2e_ui(name, suites, config = None, source_config = None, mode = "compiled", playwright = Label("//runtime:playwright"), data = [], env = {}, args = [], visibility = None):
    """Launch one local UI session over existing E2E suites with a shared config."""
    _inputs(
        name = name + "_ui_inputs",
        suites = depset(suites).to_list(),
        config = config,
        source_config = source_config,
        mode = mode,
        playwright = playwright,
        data = data,
        testonly = True,
    )
    js_binary(
        name = name,
        entry_point = Label("//runtime:ui_entry"),
        data = [":" + name + "_ui_inputs", Label("//runtime:ui_files")],
        env = env | {"WEB_E2E_UI_INPUTS": "$(rlocationpath :%s_ui_inputs)" % name},
        args = args,
        patch_node_fs = False,
        copy_data_to_bin = False,
        testonly = True,
        tags = ["manual"],
        visibility = visibility,
    )
