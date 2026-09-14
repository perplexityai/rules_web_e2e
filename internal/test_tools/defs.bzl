"""Declared static Linux utilities used by Bazel's native test launcher."""

TestToolsInfo = provider(fields = ["commands", "magic"])

_MULTICALL_COMMANDS = ["cat", "date", "dirname", "find", "grep", "ln", "mkdir", "ps", "rm", "sed", "sleep", "sort", "stat", "touch"]

def _linux_impl(settings, _attr):
    return {
        "//command_line_option:platforms": [str(Label("@llvm//platforms:linux_x86_64_musl"))],
        "//command_line_option:extra_toolchains": [str(Label("@llvm//toolchain:all"))] + settings["//command_line_option:extra_toolchains"],
    }

linux_tools = transition(
    implementation = _linux_impl,
    inputs = ["//command_line_option:extra_toolchains"],
    outputs = ["//command_line_option:platforms", "//command_line_option:extra_toolchains"],
)

def _tools_impl(ctx):
    commands = {name: (ctx.executable.toybox, [name]) for name in _MULTICALL_COMMANDS}
    commands.update({name: (getattr(ctx.executable, name), []) for name in ["file", "pgrep", "zip"]})
    files = depset([ctx.executable.toybox, ctx.executable.file, ctx.executable.pgrep, ctx.executable.zip, ctx.file.magic])
    return [DefaultInfo(files = files, runfiles = ctx.runfiles(transitive_files = files)), TestToolsInfo(commands = commands, magic = ctx.file.magic)]

test_tools = rule(
    implementation = _tools_impl,
    cfg = linux_tools,
    attrs = dict(
        {name: attr.label(executable = True, cfg = "target", mandatory = True) for name in ["toybox", "file", "pgrep", "zip"]},
        _allowlist_function_transition = attr.label(default = "@bazel_tools//tools/allowlists/function_transition_allowlist"),
        magic = attr.label(allow_single_file = True, mandatory = True),
    ),
)
