"""Materialize declared runtime files with the existing coreutils toolchain."""

DIRECTORY_TOOLCHAIN = "@bazel_lib//lib:coreutils_toolchain_type"

def copy_runtime_files(ctx, output, files, inputs):
    coreutils = ctx.toolchains[DIRECTORY_TOOLCHAIN].coreutils_info.bin
    args = ctx.actions.args()
    args.add_all([coreutils.path, output.path])
    for source, destination in files.items():
        args.add_all([source, destination])
    ctx.actions.run_shell(
        arguments = [args],
        inputs = inputs,
        tools = [coreutils],
        outputs = [output],
        command = "\n".join([
            'set -euo pipefail',
            'coreutils="$1"; output="$2"; shift 2',
            '"$coreutils" mkdir -p -- "$output"',
            'while (( $# )); do',
            '    target="$output/$2"',
            '    "$coreutils" mkdir -p -- "${target%/*}"',
            '    "$coreutils" cp -R -L --preserve=mode -T -- "$1" "$target"',
            '    shift 2',
            'done',
        ]),
        mnemonic = "BrowserRuntimeFiles",
    )

def _directory_impl(ctx):
    output = ctx.actions.declare_directory(ctx.label.name)
    files = {}
    for target, destination in ctx.attr.files.items():
        sources = target.files.to_list()
        if len(sources) != 1:
            fail("Runtime file entries must provide exactly one file or directory")
        files[sources[0].path] = destination
    copy_runtime_files(ctx, output, files, ctx.files.files)
    return [DefaultInfo(files = depset([output]), runfiles = ctx.runfiles(files = [output]))]

runtime_directory = rule(
    implementation = _directory_impl,
    attrs = {"files": attr.label_keyed_string_dict(allow_files = True)},
    toolchains = [DIRECTORY_TOOLCHAIN],
)
