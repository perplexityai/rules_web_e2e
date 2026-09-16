"""Analysis checks for VRT's runtime, target CPU, and action boundary."""

load("@bazel_skylib//lib:unittest.bzl", "analysistest", "asserts")

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
    asserts.true(env, actions[0].argv[0].endswith(ctx.attr.loader))
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
