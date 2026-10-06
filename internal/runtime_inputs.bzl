"""Opt-in runfiles for compiled browser inputs, without source/debug metadata."""

def _is_runtime_file(ctx, file):
    # Other repositories may publish sources as runtime package contents.
    # Directory artifacts are indivisible and must be projected by their owner.
    if file.is_directory or file.owner.workspace_name != ctx.label.workspace_name:
        return True
    return not file.basename.endswith((".ts", ".tsx", ".mts", ".cts", ".map", ".tsbuildinfo"))

def compiled_runtime_runfiles(ctx, target):
    """Keep runtime files and aliases from a compiled input's DefaultInfo."""
    info = target[DefaultInfo]
    files = info.files.to_list()
    symlinks = []
    root_symlinks = []
    for runfiles in [info.default_runfiles, info.data_runfiles]:
        if runfiles:
            files.extend(runfiles.files.to_list())
            for entry in runfiles.symlinks.to_list():
                if _is_runtime_file(ctx, entry.target_file):
                    symlinks.append(entry)
            for entry in runfiles.root_symlinks.to_list():
                if _is_runtime_file(ctx, entry.target_file):
                    root_symlinks.append(entry)
    return ctx.runfiles(
        files = [file for file in files if _is_runtime_file(ctx, file)],
        symlinks = depset(symlinks),
        root_symlinks = depset(root_symlinks),
    )
