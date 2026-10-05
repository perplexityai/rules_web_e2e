"""Write known layouts during analysis; resolve package revisions in an action."""

BROWSER_ASSEMBLY_TOOLCHAINS = [
    "@bazel_lib//lib:coreutils_toolchain_type",
]

def browser_directory(ctx, manifest, inputs, name = None, layout = None):
    name = name or ctx.label.name
    output = ctx.actions.declare_directory(name)
    request = ctx.actions.declare_file(name + ".layout.json")
    plan = ctx.actions.declare_file(name + ".copy-layout")
    executables = ctx.actions.declare_file(name + ".executables")
    ctx.actions.write(request, json.encode(manifest))
    validation = []
    if layout != None:
        ctx.actions.write(plan, "\0".join([value for file in layout.files for value in [file["source"], file["destination"]]]) + "\0")
        ctx.actions.write(executables, "\0".join(layout.executables) + "\0")
        stamp = ctx.actions.declare_file(name + ".validated")
        validation = [stamp]
    ctx.actions.run(
        executable = ctx.executable._browser_files,
        env = {"BAZEL_BINDIR": ctx.bin_dir.path},
        arguments = ["--validate-linux", request.path, stamp.path] if layout != None else [request.path, output.path, plan.path, executables.path],
        inputs = inputs + [request],
        outputs = validation if layout != None else [plan, executables],
        mnemonic = "BrowserValidation" if layout != None else "BrowserLayout",
    )
    coreutils = ctx.toolchains["@bazel_lib//lib:coreutils_toolchain_type"].coreutils_info.bin
    ctx.actions.run_shell(
        arguments = [ctx.file._copy_layout.path, coreutils.path, plan.path, executables.path, output.path],
        inputs = inputs + [plan, executables, ctx.file._copy_layout] + validation,
        tools = [coreutils],
        outputs = [output],
        command = 'source "$1" "${@:2}"',
        mnemonic = "BrowserDirectory",
        toolchain = None,
    )
    return output
