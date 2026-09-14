"""Compile libmagic's database with declared tools and a private working directory."""

def _magic_impl(ctx):
    args = ctx.actions.args()
    args.add(ctx.executable.compiler)
    args.add(ctx.outputs.out)
    args.add_all(ctx.files.srcs)
    ctx.actions.run(
        executable = ctx.executable._generator,
        arguments = [args],
        inputs = ctx.files.srcs,
        tools = [ctx.attr.compiler[DefaultInfo].files_to_run],
        outputs = [ctx.outputs.out],
        mnemonic = "CompileMagicDatabase",
    )
    return [DefaultInfo(files = depset([ctx.outputs.out]))]

magic_database = rule(
    implementation = _magic_impl,
    attrs = {
        "srcs": attr.label_list(allow_files = True),
        "out": attr.output(mandatory = True),
        "compiler": attr.label(executable = True, cfg = "exec", mandatory = True),
        "_generator": attr.label(default = Label("//internal/test_tools:compile_magic"), executable = True, cfg = "exec"),
    },
)

# Database compilation runs on the execution platform, which may differ from
# the Linux test platform. Use musl on Linux so this build-time tool also has no
# dependency on the host's ELF loader or libc; preserve other execution platforms.
def _compiler_platform_impl(settings, attr):
    return {"//command_line_option:platforms": [str(attr.platform)] if attr.platform else settings["//command_line_option:platforms"]}

_compiler_platform = transition(
    implementation = _compiler_platform_impl,
    inputs = ["//command_line_option:platforms"],
    outputs = ["//command_line_option:platforms"],
)

def _compiler_impl(ctx):
    binary = ctx.attr.binary[0][DefaultInfo]
    executable = ctx.actions.declare_file(ctx.label.name)
    ctx.actions.symlink(output = executable, target_file = binary.files_to_run.executable, is_executable = True)
    return [DefaultInfo(executable = executable, runfiles = binary.default_runfiles)]

static_compiler = rule(
    implementation = _compiler_impl,
    executable = True,
    attrs = {
        "binary": attr.label(cfg = _compiler_platform, executable = True, mandatory = True),
        "platform": attr.label(),
        "_allowlist_function_transition": attr.label(default = "@bazel_tools//tools/allowlists/function_transition_allowlist"),
    },
)
