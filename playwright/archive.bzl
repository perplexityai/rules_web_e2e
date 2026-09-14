"""Assemble declared package archives and files into a browser runtime directory."""

def _archive_impl(ctx):
    archives = ([ctx.file.archive] if ctx.file.archive else []) + ctx.files.archives
    if not archives:
        fail("Supply archive or archives")
    root = ctx.actions.declare_directory(ctx.label.name)
    manifest = ctx.actions.declare_file(ctx.label.name + ".manifest.json")
    files = {}
    for target, destination in ctx.attr.files.items():
        outputs = target.files.to_list()
        if len(outputs) != 1:
            fail("files entries must provide exactly one file or directory: " + str(target.label))
        files[outputs[0].path] = destination
    ctx.actions.write(manifest, json.encode({
        "archives": [file.path for file in archives],
        "paths": ctx.attr.paths,
        "exclude": ctx.attr.exclude,
        "files": files,
    }))
    ctx.actions.run(
        executable = ctx.executable._unpack,
        arguments = ["--manifest", manifest.path, root.path],
        inputs = archives + [manifest] + ctx.files.files,
        tools = [ctx.attr._unpack[DefaultInfo].files_to_run],
        outputs = [root],
        mnemonic = "BrowserRuntimeUnpack",
    )
    return [DefaultInfo(files = depset([root]), runfiles = ctx.runfiles(files = [root]))]

browser_runtime_archive = rule(
    implementation = _archive_impl,
    doc = "Assemble filesystem tar archives and declared files into a closed directory for browser_runtime(root=...).",
    attrs = {
        "archive": attr.label(allow_single_file = True, doc = "A single filesystem tar; may be combined with archives."),
        "archives": attr.label_list(allow_files = True, doc = "Filesystem tars (for example package data archives), extracted in order."),
        "exclude": attr.string_list(doc = "Archive-relative files or directories omitted before selection; excluded link targets remain errors."),
        "paths": attr.string_dict(doc = "Archive-relative source paths mapped to output paths. Empty selects the whole filesystem."),
        "files": attr.label_keyed_string_dict(allow_files = True, doc = "Declared single files or directories mapped to additional output paths."),
        "_unpack": attr.label(default = Label("//playwright:unpack_runtime"), executable = True, cfg = "exec"),
    },
)
