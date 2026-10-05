"""Plan browser layout, then copy with declared coreutils."""

BROWSER_ASSEMBLY_TOOLCHAINS = [
    "@bazel_lib//lib:coreutils_toolchain_type",
]

def browser_directory(ctx, manifest, inputs, name = None):
    name = name or ctx.label.name
    output = ctx.actions.declare_directory(name)
    request = ctx.actions.declare_file(name + ".layout.json")
    plan = ctx.actions.declare_file(name + ".copy-layout")
    executables = ctx.actions.declare_file(name + ".executables")
    ctx.actions.write(request, json.encode(manifest))
    ctx.actions.run(
        executable = ctx.executable._browser_files,
        env = {"BAZEL_BINDIR": ctx.bin_dir.path},
        arguments = [request.path, output.path, plan.path, executables.path],
        inputs = inputs + [request],
        outputs = [plan, executables],
        mnemonic = "BrowserLayout",
    )
    coreutils = ctx.toolchains["@bazel_lib//lib:coreutils_toolchain_type"].coreutils_info.bin
    ctx.actions.run_shell(
        arguments = [ctx.file._copy_layout.path, coreutils.path, plan.path, executables.path, output.path],
        inputs = inputs + [plan, executables, ctx.file._copy_layout],
        tools = [coreutils],
        outputs = [output],
        command = 'source "$1" "${@:2}"',
        mnemonic = "BrowserDirectory",
        toolchain = None,
    )
    return output
