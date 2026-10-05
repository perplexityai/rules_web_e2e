"""Map declared browser inputs during analysis. Never scan runtime directories."""

load("@bazel_skylib//lib:paths.bzl", "paths")

def _relative(value):
    if not value or value.startswith("/") or any([part in ["", ".", ".."] for part in value.split("/")]):
        fail("Expected a relative browser path without dot segments: " + value)
    return value

def browser_input(files, executable_path):
    """Return an executable path and its sibling bundle's copy entries."""
    _relative(executable_path)
    directories = [file for file in files if file.is_directory]
    if directories:
        if len(files) != 1:
            fail("Browser input must provide files or one declared directory")
        root = paths.normalize(paths.join(files[0].path, paths.dirname(executable_path)))
        return struct(
            executable = paths.join(files[0].path, executable_path),
            files = [{"source": root, "destination": ""}],
        )
    matches = [file for file in files if file.path == executable_path or file.path.endswith("/" + executable_path)]
    if len(matches) != 1:
        fail("Browser input must contain exactly one " + executable_path)
    executable = matches[0]
    root = executable.dirname + "/" if executable.dirname else ""
    return struct(
        executable = executable.path,
        files = [{"source": file.path, "destination": file.path[len(root):]} for file in files if file.path.startswith(root)],
    )

def linux_layout(system, node, chromium, ffmpeg, fonts):
    """Copy destinations for the closed Linux runtime."""
    return struct(
        files = [{"source": system.path, "destination": ""}] + [
            {"source": file["source"], "destination": paths.normalize(paths.join("chromium", file["destination"]))}
            for file in chromium.files
        ] + [{"source": node.path, "destination": "bin/node"}] + (
            [{"source": ffmpeg, "destination": "bin/ffmpeg-linux"}] if ffmpeg else []
        ) + [
            {"source": file.path, "destination": paths.normalize(paths.join("fonts/custom", str(index), "" if file.is_directory else file.basename))}
            for index, file in enumerate(fonts)
        ],
        executables = ["bin/node"] + (["bin/ffmpeg-linux"] if ffmpeg else []),
    )
