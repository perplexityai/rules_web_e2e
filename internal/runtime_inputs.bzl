"""Runfiles for compiled browser inputs, without source/debug metadata."""

load("@bazel_lib//lib:copy_to_directory.bzl", "copy_to_directory_bin_action")
load("@bazel_lib//lib:paths.bzl", "to_repository_relative_path")

def _is_package_file(ctx, file):
    # Node resolves imports from real compiled-file paths, so npm trees must stay put.
    return file.owner.workspace_name != ctx.label.workspace_name or "node_modules" in file.short_path.split("/")

def _is_runtime_file(ctx, file):
    # Other repositories may publish sources as runtime package contents.
    if file.is_directory or _is_package_file(ctx, file):
        return True
    return not file.basename.endswith((".ts", ".tsx", ".mts", ".cts", ".map", ".tsbuildinfo"))

def _runtime_directory(ctx, file, directories):
    if not file.is_directory or _is_package_file(ctx, file):
        return file
    if file not in directories:
        output = ctx.actions.declare_directory(ctx.label.name + ".runtime/" + str(len(directories)))
        copy_to_directory_bin_action(
            ctx,
            name = ctx.label.name + "_runtime_" + str(len(directories)),
            dst = output,
            copy_to_directory_bin = ctx.toolchains["@bazel_lib//lib:copy_to_directory_toolchain_type"].copy_to_directory_info.bin,
            files = [file],
            root_paths = [to_repository_relative_path(file)],
            exclude_srcs_patterns = ["**/*.map"],
            hardlink = "off",
        )
        directories[file] = output
    return directories[file]

def compiled_runtime_runfiles(ctx, target, directories):
    """Keep runtime files and aliases from a compiled input's DefaultInfo."""
    info = target[DefaultInfo]
    files = info.files.to_list()
    symlinks = {}
    root_symlinks = {}
    for runfiles in [info.default_runfiles, info.data_runfiles]:
        if runfiles:
            files.extend(runfiles.files.to_list())
            for entry in runfiles.symlinks.to_list():
                if _is_runtime_file(ctx, entry.target_file):
                    symlinks[entry.path] = _runtime_directory(ctx, entry.target_file, directories)
            for entry in runfiles.root_symlinks.to_list():
                if _is_runtime_file(ctx, entry.target_file):
                    root_symlinks[entry.path] = _runtime_directory(ctx, entry.target_file, directories)
    runtime_files = []
    for file in files:
        if not _is_runtime_file(ctx, file):
            continue
        projected = _runtime_directory(ctx, file, directories)
        if projected != file:
            # Keep paths embedded in compiled code and browser descriptors valid.
            symlinks[file.short_path] = projected
        else:
            runtime_files.append(file)
    return ctx.runfiles(
        # Isolated launchers stage canonical files before recreating aliases.
        files = runtime_files + [output for original, output in directories.items() if output != original],
        symlinks = symlinks,
        root_symlinks = root_symlinks,
    )
