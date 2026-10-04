"""Analysis checks for VRT's runtime, target CPU, and action boundary."""

load("@bazel_skylib//lib:unittest.bzl", "analysistest", "asserts")
load("@web_e2e_worker_identity//:defs.bzl", "WORKER_SHA256")

def _directory_impl(ctx):
    output = ctx.actions.declare_directory(ctx.label.name)
    ctx.actions.run_shell(outputs = [output], command = 'mkdir -p "$1"', arguments = [output.path])
    return [DefaultInfo(files = depset([output]))]

directory = rule(implementation = _directory_impl)

_PLATFORMS = {"//command_line_option:extra_execution_platforms": [
    str(Label("@platforms//host:host")),
    str(Label("//internal:linux_amd64")),
    str(Label("//internal:linux_arm64")),
]}

def _capture_impl(ctx):
    env = analysistest.begin(ctx)
    actions = [action for action in analysistest.target_actions(env) if action.mnemonic == "VrtCapture"]
    asserts.equals(env, 1, len(actions))
    action = actions[0]
    asserts.true(env, action.argv[0].endswith("_capture_launcher"))
    # Bazel 8 exposes a runfiles middleman; Bazel 9 exposes a runfiles tree.
    asserts.true(env, any([file.basename.endswith(".runfiles") or file.basename.endswith("-runfiles") for file in action.inputs.to_list()]), "Bazel must supply launcher runfiles")
    asserts.equals(env, action.outputs.to_list()[0].path, action.argv[1])
    return analysistest.end(env)

capture_test = analysistest.make(
    _capture_impl,
    config_settings = _PLATFORMS,
    attrs = {"loader": attr.string(mandatory = True)},
)

def _failure_impl(ctx):
    env = analysistest.begin(ctx)
    asserts.expect_failure(env, ctx.attr.message)
    return analysistest.end(env)

failure_test = analysistest.make(
    _failure_impl,
    expect_failure = True,
    config_settings = _PLATFORMS,
    attrs = {"message": attr.string(mandatory = True)},
)

_Properties = provider(fields = ["values"])

def _properties_impl(_target, ctx):
    return [_Properties(values = ctx.rule.attr.exec_properties)]

_properties = aspect(implementation = _properties_impl)

def _properties_test_impl(ctx):
    env = analysistest.begin(ctx)
    properties = analysistest.target_under_test(env)[_Properties].values
    asserts.equals(env, ctx.attr.worker_sha256, properties.get("actiond-worker-sha256", ""))
    return analysistest.end(env)

properties_test = analysistest.make(
    _properties_test_impl,
    config_settings = _PLATFORMS,
    extra_target_under_test_aspects = [_properties],
    attrs = {"worker_sha256": attr.string(default = WORKER_SHA256)},
)

def _typed_fixture_impl(ctx):
    spec = ctx.actions.declare_file("typed.browser.spec.js")
    asset = ctx.actions.declare_file("fixture-asset.txt")
    check = ctx.actions.declare_file("semantic-check.txt")
    for output in [spec, asset, check]:
        ctx.actions.write(output, "")
    return [
        DefaultInfo(files = depset([spec]), runfiles = ctx.runfiles(files = [asset])),
        OutputGroupInfo(transitive_typecheck = depset([check])),
    ]

typed_fixture = rule(implementation = _typed_fixture_impl)

def _runtime_inputs_test_impl(ctx):
    env = analysistest.begin(ctx)
    files = analysistest.target_under_test(env)[DefaultInfo].default_runfiles.files.to_list()
    names = [file.basename for file in files]
    asserts.true(env, "typed.browser.spec.js" in names)
    asserts.true(env, "fixture-asset.txt" in names)
    asserts.false(env, "semantic-check.txt" in names)
    harness = [file for file in files if file.basename.endswith(".suite")]
    asserts.equals(env, 1, len(harness))
    asserts.true(env, harness[0].is_directory)
    actions = [action for action in analysistest.target_actions(env) if action.mnemonic == "BrowserSuite"]
    asserts.equals(env, 1, len(actions))
    asserts.true(env, harness[0] in actions[0].outputs.to_list())
    return analysistest.end(env)

runtime_inputs_test = analysistest.make(_runtime_inputs_test_impl)

def _harness_selection_test_impl(ctx):
    env = analysistest.begin(ctx)
    action = [action for action in analysistest.target_actions(env) if action.mnemonic == "BrowserSuite"][0]
    destinations = json.decode(action.argv[-1])
    captures = [source for source, destination in destinations.items() if destination == ".rules-visual.spec.js"]
    asserts.equals(env, 1 if ctx.attr.gallery else 0, len(captures))
    inputs = [file.path for file in action.inputs.to_list()]
    for source in destinations:
        asserts.true(env, source in inputs, "Mapped source must be a declared action input: " + source)
    # Ordinary suites should not depend on an unused capture template either.
    asserts.equals(env, ctx.attr.gallery, any([file.basename == "capture.js" for file in action.inputs.to_list()]))
    return analysistest.end(env)

harness_selection_test = analysistest.make(
    _harness_selection_test_impl,
    attrs = {"gallery": attr.bool()},
)

def _native_visual_test_impl(ctx):
    env = analysistest.begin(ctx)
    target = analysistest.target_under_test(env)
    # Assert the public visual target owns remote execution, rather than a
    # local JS wrapper reporting the status of a cached build action.
    asserts.equals(env, "1", target[testing.ExecutionInfo].requirements.get("no-local"))
    asserts.true(env, any([file.basename.endswith(".job.json") for file in target[DefaultInfo].default_runfiles.files.to_list()]))
    asserts.false(env, any([file.basename.endswith(".results") for file in target[DefaultInfo].default_runfiles.files.to_list()]))
    asserts.false(env, any([action.mnemonic == "VrtCompare" for action in analysistest.target_actions(env)]))
    return analysistest.end(env)

native_visual_test = analysistest.make(_native_visual_test_impl, config_settings = _PLATFORMS)
