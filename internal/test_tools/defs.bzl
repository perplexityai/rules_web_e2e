"""Declared static Linux utilities used by Bazel's native test launcher."""

load("//playwright:defs.bzl", "runfile")

TestToolsInfo = provider(fields = ["shell_setup"])

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
    commands.update({name: (getattr(ctx.executable, name), []) for name in ["file", "zip"]})
    setup = ctx.actions.declare_file(ctx.label.name + ".bash-env")
    ctx.actions.write(setup, "\n".join([
        'export MAGIC="$TEST_SRCDIR/%s"' % runfile(ctx.file.magic),
    ] + [
        '%s() { "$TEST_SRCDIR/%s" %s "$@"; }; export -f %s' % (command, runfile(binary), " ".join(args), command)
        for command, (binary, args) in commands.items()
    ] + [
        # Bazel checks only whether this exact process-group probe has output.
        # Toybox has -g but not procps's -a (print full command line).
        "pgrep() {",
        "  if [[ $# == 3 && $1 == -a && $2 == -g ]]; then shift; fi",
        '  "$TEST_SRCDIR/%s" pgrep "$@"' % runfile(ctx.executable.toybox),
        "}; export -f pgrep",
    ]) + "\n")
    files = depset([ctx.executable.toybox, ctx.executable.file, ctx.executable.zip, ctx.file.magic, setup])
    return [DefaultInfo(files = files, runfiles = ctx.runfiles(transitive_files = files)), TestToolsInfo(shell_setup = setup)]

test_tools = rule(
    implementation = _tools_impl,
    cfg = linux_tools,
    attrs = dict(
        {name: attr.label(executable = True, cfg = "target", mandatory = True) for name in ["toybox", "file", "zip"]},
        _allowlist_function_transition = attr.label(default = "@bazel_tools//tools/allowlists/function_transition_allowlist"),
        magic = attr.label(allow_single_file = True, mandatory = True),
    ),
)
