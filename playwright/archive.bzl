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

def _oci_impl(ctx):
    if not ctx.file.image.is_directory:
        fail("image must provide a declared OCI image layout directory")
    root = ctx.actions.declare_directory(ctx.label.name)
    selection = ctx.actions.declare_file(ctx.label.name + ".selection.json")
    files = {}
    for target, destination in ctx.attr.files.items():
        if len(target.files.to_list()) != 1:
            fail("files entries must provide exactly one file: " + str(target.label))
        files[target.files.to_list()[0].path] = destination
    ctx.actions.write(selection, json.encode({"paths": ctx.attr.paths, "files": files}))
    ctx.actions.run(
        executable = ctx.executable._unpack,
        arguments = [ctx.file.image.path, root.path, ctx.attr.directory, "amd64", selection.path],
        inputs = [ctx.file.image, selection] + ctx.files.files,
        tools = [ctx.attr._unpack[DefaultInfo].files_to_run],
        outputs = [root],
        mnemonic = "BrowserRuntimeOci",
    )
    return [DefaultInfo(files = depset([root]), runfiles = ctx.runfiles(files = [root]))]

browser_runtime_oci = rule(
    implementation = _oci_impl,
    doc = "Apply a caller-owned Linux amd64 OCI image's declared layers and materialize its runtime directory.",
    attrs = {
        "image": attr.label(mandatory = True, allow_single_file = True),
        "directory": attr.string(default = "."),
        "paths": attr.string_dict(doc = "Selected image paths, relative to directory, mapped to output paths. Empty selects the whole directory."),
        "files": attr.label_keyed_string_dict(allow_files = True, doc = "Declared single files mapped to additional output paths."),
        "_unpack": attr.label(default = Label("//playwright:unpack_oci"), executable = True, cfg = "exec"),
    },
)
