"""Compile libmagic's database with declared tools."""

def _magic_impl(ctx):
    if not ctx.outputs.out.basename.endswith(".mgc"):
        fail("magic database output must end with .mgc")
    coreutils = ctx.toolchains["@bazel_lib//lib:coreutils_toolchain_type"].coreutils_info.bin
    # Compile in the output directory: libmagic writes the input basename + .mgc.
    definitions = ctx.actions.declare_file(ctx.outputs.out.basename[:-4], sibling = ctx.outputs.out)
    ctx.actions.run_shell(
        arguments = [coreutils.path, definitions.path] + [file.path for file in ctx.files.srcs],
        inputs = ctx.files.srcs,
        tools = [coreutils],
        outputs = [definitions],
        command = 'coreutils="$1"; output="$2"; shift 2; "$coreutils" cat -- "$@" > "$output"',
        mnemonic = "ConcatMagicDefinitions",
    )
    ctx.actions.run_shell(
        tools = [ctx.attr.compiler[DefaultInfo].files_to_run],
        arguments = [ctx.executable.compiler.path, definitions.dirname, definitions.basename],
        command = 'compiler="$PWD/$1"; cd "$2"; exec "$compiler" -C -m "$3"',
        inputs = [definitions],
        outputs = [ctx.outputs.out],
        mnemonic = "CompileMagicDatabase",
    )
    return [DefaultInfo(files = depset([ctx.outputs.out]))]

magic_database = rule(
    implementation = _magic_impl,
    toolchains = ["@bazel_lib//lib:coreutils_toolchain_type"],
    attrs = {
        "srcs": attr.label_list(allow_files = True),
        "out": attr.output(mandatory = True),
        "compiler": attr.label(executable = True, cfg = "exec", mandatory = True),
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
