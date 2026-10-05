"""Built shell runfiles contain runtime assets, not their compiler inputs."""

load("@bazel_skylib//lib:unittest.bzl", "asserts", "unittest")
load("//component:defs.bzl", "browser_shell")

def _assets_impl(ctx):
    output = ctx.actions.declare_directory(ctx.label.name)
    compiler_input = ctx.actions.declare_file(ctx.label.name + ".ts")
    ctx.actions.write(compiler_input, "export const buildOnly = true;\n")
    ctx.actions.run_shell(outputs = [output], arguments = [output.path], command = 'mkdir -p "$1"')
    return [DefaultInfo(files = depset([output]), runfiles = ctx.runfiles(files = [output, compiler_input]))]

_assets = rule(implementation = _assets_impl)

def _shell_test_impl(ctx):
    env = unittest.begin(ctx)
    expected = ctx.attr.assets[DefaultInfo].files.to_list()
    actual = ctx.attr.shell[DefaultInfo].default_runfiles.files.to_list()
    asserts.equals(env, expected, actual)
    return unittest.end(env)

_shell_test = unittest.make(_shell_test_impl, attrs = {"assets": attr.label(), "shell": attr.label()})

def shell_tests():
    _assets(name = "shell_assets_fixture")
    browser_shell(name = "shell_fixture", assets = ":shell_assets_fixture")
    _shell_test(name = "shell_runtime_inputs_test", assets = ":shell_assets_fixture", shell = ":shell_fixture")
