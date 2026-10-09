"""Aggregate browser suites into a declared Playwright UI bundle."""

load("@aspect_rules_js//js:defs.bzl", "js_binary")
load("@bazel_lib//lib:copy_to_directory.bzl", "copy_to_directory_bin_action")
load("@bazel_lib//lib:paths.bzl", "to_repository_relative_path", "to_rlocation_path")
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

def _common_directory(files):
    parts = [file.path.split("/")[:-1] for file in files]
    common = []
    for i in range(min([len(value) for value in parts])):
        if any([value[i] != parts[0][i] for value in parts]):
            break
        common.append(parts[0][i])
    return common

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
    config_files = [file for file in ctx.files.config if file.extension in ["js", "mjs"]]
    if len(config_files) != 1 or config_files[0].is_source:
        fail("config must supply one compiled JavaScript module")
    runtime = ctx.attr.playwright[PlaywrightInfo]
    bundle = ctx.actions.declare_directory(ctx.label.name + ".suite")
    generated = []
    destinations = {}
    wrappers = []
    for file in tests:
        destination = "specs/" + to_rlocation_path(ctx, file) + ".js"
        wrapper = ctx.actions.declare_file(ctx.label.name + ".generated/" + destination)
        helper = "../" * (len(destination.split("/")) - 1) + "runfiles.mjs"
        wrappers.append({
            "input": file.path,
            "output": wrapper.path,
            "destination": bundle.path + "/" + destination,
            "helper": helper,
            "runfile": to_rlocation_path(ctx, file),
        })
        generated.append(wrapper)
        destinations[to_repository_relative_path(wrapper)] = destination
    manifest = ctx.actions.declare_file(ctx.label.name + ".wrappers.json")
    ctx.actions.write(manifest, json.encode(wrappers))
    ctx.actions.run(
        executable = ctx.executable._wrapper_tool,
        arguments = [manifest.path],
        inputs = depset([manifest] + tests + [file for file in runfiles.files.to_list() if file.path.endswith(".map")]),
        outputs = generated[:],
        env = {"BAZEL_BINDIR": ctx.bin_dir.path},
        mnemonic = "PlaywrightUiWrappers",
    )
    package = ctx.actions.declare_file(ctx.label.name + ".generated/package.json")
    ctx.actions.write(package, '{"type":"module"}')
    generated.append(package)
    destinations[to_repository_relative_path(package)] = "package.json"
    root_up = "/".join([".."] * (len(tests[0].path.split("/")) - 1 - len(_common_directory(tests)))) or "."
    substitutions = {
        "%{config}": json.encode(to_rlocation_path(ctx, config_files[0])),
        "%{playwright}": json.encode(runtime.test),
        "%{root_anchor}": json.encode(to_rlocation_path(ctx, tests[0])),
        "%{root_up}": json.encode(root_up),
        "%{output_path}": json.encode(ctx.label.package + "/" + ctx.attr.output_name),
    }
    for template, destination in [
        (ctx.file._config_template, "playwright.config.mjs"),
        (ctx.file._runfiles_template, "runfiles.mjs"),
    ]:
        output = ctx.actions.declare_file(ctx.label.name + ".generated/" + destination)
        ctx.actions.expand_template(template = template, output = output, substitutions = substitutions)
        generated.append(output)
        destinations[to_repository_relative_path(output)] = destination

    # Playwright ignores individually symlinked specs. A tree artifact contains real
    # files and bounds directory watching to the selected specs, not Bazel runfiles.
    copy_to_directory_bin_action(
        ctx,
        name = ctx.label.name,
        dst = bundle,
        copy_to_directory_bin = ctx.toolchains["@bazel_lib//lib:copy_to_directory_toolchain_type"].copy_to_directory_info.bin,
        files = generated,
        root_paths = [],
        include_external_repositories = ["**"],
        replace_prefixes = destinations,
        hardlink = "off",
    )
    launcher = ctx.actions.declare_file(ctx.label.name + ".mjs")
    ctx.actions.expand_template(
        template = ctx.file._launcher_template,
        output = launcher,
        substitutions = {"%{bundle}": json.encode(to_rlocation_path(ctx, bundle))},
    )
    for target in [ctx.attr.config, ctx.attr.playwright] + ctx.attr.data:
        runfiles = runfiles.merge(target[DefaultInfo].default_runfiles).merge(ctx.runfiles(transitive_files = target[DefaultInfo].files))
    return [
        DefaultInfo(files = depset([launcher]), runfiles = runfiles.merge(ctx.runfiles(files = [launcher, bundle]))),
        OutputGroupInfo(ui_bundle = depset([bundle])),
    ]

_inputs = rule(
    implementation = _inputs_impl,
    attrs = {
        "suites": attr.label_list(mandatory = True, aspects = [_suites]),
        "config": attr.label(mandatory = True, allow_files = True),
        "playwright": attr.label(mandatory = True, providers = [PlaywrightInfo]),
        "data": attr.label_list(allow_files = True),
        "output_name": attr.string(mandatory = True),
        "_wrapper_tool": attr.label(default = Label("//internal:ui_wrapper_tool"), executable = True, cfg = "exec"),
        "_config_template": attr.label(default = Label("//internal:ui-config.mjs.tpl"), allow_single_file = True),
        "_runfiles_template": attr.label(default = Label("//internal:ui-runfiles.mjs.tpl"), allow_single_file = True),
        "_launcher_template": attr.label(default = Label("//internal:ui-launcher.mjs.tpl"), allow_single_file = True),
    },
    toolchains = ["@bazel_lib//lib:copy_to_directory_toolchain_type"],
)

def web_e2e_ui(name, suites, config, playwright = Label("//runtime:playwright"), data = [], env = {}, args = [], visibility = None):
    """Build an aggregate UI bundle and run it with declared Node and Playwright."""
    _inputs(
        name = name + "_ui_inputs",
        suites = depset(suites).to_list(),
        config = config,
        playwright = playwright,
        data = data,
        output_name = name,
        testonly = True,
    )
    js_binary(
        name = name,
        entry_point = ":" + name + "_ui_inputs",
        data = [":" + name + "_ui_inputs"] + data,
        env = env,
        args = args,
        patch_node_fs = False,
        copy_data_to_bin = False,
        testonly = True,
        tags = ["manual"],
        visibility = visibility,
    )
