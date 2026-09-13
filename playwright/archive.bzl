"""Turn a caller-produced flattened runtime archive into declared files."""

def _archive_impl(ctx):
    root = ctx.actions.declare_directory(ctx.label.name)
    ctx.actions.run(
        executable = ctx.executable._unpack,
        arguments = [ctx.file.archive.path, root.path],
        inputs = [ctx.file.archive],
        tools = [ctx.attr._unpack[DefaultInfo].files_to_run],
        outputs = [root],
        mnemonic = "BrowserRuntimeUnpack",
    )
    return [DefaultInfo(files = depset([root]), runfiles = ctx.runfiles(files = [root]))]

browser_runtime_archive = rule(
    implementation = _archive_impl,
    doc = "Unpack a flattened Linux runtime tar into a closed directory for browser_runtime(root=...).",
    attrs = {
        "archive": attr.label(mandatory = True, allow_single_file = True),
        "_unpack": attr.label(default = Label("//playwright:unpack_runtime"), executable = True, cfg = "exec"),
    },
)
