"""Assemble declared package archives and files into a browser runtime directory."""

load(":directory.bzl", "copy_runtime_files")

def _archive_impl(ctx):
    archives = ([ctx.file.archive] if ctx.file.archive else []) + ctx.files.archives
    if not archives:
        fail("Supply archive or archives")
    # node-tar handles tar/gzip. Use the existing declared decompressor for
    # the XZ payloads also accepted by runtime archives.
    normalized = []
    for index, archive in enumerate(archives):
        if archive.extension in ["xz", "zst"]:
            unpacked = ctx.actions.declare_file(ctx.label.name + ".archive-%d.tar" % index)
            toolchain = ctx.toolchains["@bazel_lib//lib:zstd_toolchain_type"]
            ctx.actions.run(
                executable = toolchain.zstdinfo.binary,
                arguments = ["--decompress", "--force", archive.path, "-o", unpacked.path],
                inputs = [archive],
                tools = toolchain.default.files,
                outputs = [unpacked],
                mnemonic = "BrowserArchiveTar",
            )
            normalized.append(unpacked)
        else:
            normalized.append(archive)
    archives = normalized
    root = ctx.actions.declare_directory(ctx.label.name)
    extracted = ctx.actions.declare_directory(ctx.label.name + ".archive") if ctx.attr.files else root
    declared = []
    manifest = ctx.actions.declare_file(ctx.label.name + ".manifest.json")
    files = {}
    for target, destination in ctx.attr.files.items():
        outputs = target.files.to_list()
        if len(outputs) != 1:
            fail("files entries must provide exactly one file or directory: " + str(target.label))
        files[outputs[0].path] = destination
        declared.append(outputs[0])
    ctx.actions.write(manifest, json.encode({
        "archives": [file.path for file in archives],
        "paths": ctx.attr.paths,
        "exclude": ctx.attr.exclude,
        "files": files,
    }))
    ctx.actions.run(
        executable = ctx.executable._unpack,
        env = {"BAZEL_BINDIR": ctx.bin_dir.path},
        arguments = ["--manifest", manifest.path, extracted.path],
        inputs = archives + [manifest],
        tools = [ctx.attr._unpack[DefaultInfo].files_to_run],
        outputs = [extracted],
        mnemonic = "BrowserRuntimeUnpack",
    )
    if declared:
        copy_runtime_files(ctx, root, dict({extracted.path: ""}, **files), [extracted] + declared)
    return [DefaultInfo(files = depset([root]), runfiles = ctx.runfiles(files = [root]))]

browser_runtime_archive = rule(
    implementation = _archive_impl,
    toolchains = ["@bazel_lib//lib:zstd_toolchain_type", "@bazel_lib//lib:coreutils_toolchain_type"],
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
