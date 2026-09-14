"""Assemble package files without consulting host libraries.

Archive-root absolute links are rewritten before extraction. Selected links are
materialized so the Bazel tree artifact contains only files and directories.
"""
import json
import os
from pathlib import Path
import posixpath
import shutil
import sys
import tarfile
import tempfile


def image_filter(member, destination):
    if member.name.startswith("/") or ".." in member.name.split("/"):
        raise ValueError(f"Runtime archive path escapes archive root: {member.name}")
    if member.name.rsplit("/", 1)[-1].startswith(".wh."):
        raise ValueError("Runtime filesystem archives must not contain whiteouts")
    if member.issym() and member.linkname.startswith("/"):
        target = posixpath.normpath(member.linkname).lstrip("/")
        member = member.replace(linkname=posixpath.relpath(target or ".", posixpath.dirname(member.name) or "."))
    if member.islnk() and member.linkname.startswith("/"):
        member = member.replace(linkname=posixpath.normpath(member.linkname).lstrip("/"))
    return tarfile.data_filter(member, destination)


def materialize(root, source, target, parents=frozenset()):
    try:
        resolved = source.resolve(strict=True)
    except FileNotFoundError as error:
        raise ValueError(f"Runtime contains a dangling link: {source.relative_to(root)}") from error
    if not resolved.is_relative_to(root):
        raise ValueError(f"Runtime link escapes archive root: {source.relative_to(root)}")
    if resolved.is_dir():
        if resolved in parents:
            raise ValueError(f"Runtime contains a directory link cycle: {source.relative_to(root)}")
        target.mkdir(parents=True, exist_ok=True)
        for entry in sorted(resolved.iterdir()):
            materialize(root, entry, target / entry.name, parents | {resolved})
    elif resolved.is_file():
        shutil.copyfile(resolved, target)
        os.chmod(target, 0o755 if resolved.stat().st_mode & 0o111 else 0o644)
    else:
        raise ValueError(f"Runtime contains an unsupported file: {source.relative_to(root)}")


def relative_path(value):
    if not value or value.startswith("/") or any(part in ("", ".", "..") for part in value.split("/")):
        raise ValueError(f"Expected a relative runtime path without dot segments: {value}")
    return value


def assemble(archives, output, paths=None, files=None, exclude=()):
    paths, files = paths or {}, files or {}
    exclude = [relative_path(value) for value in exclude]

    def archive_filter(member, destination):
        member = image_filter(member, destination)
        name = posixpath.normpath(member.name)
        if any(name == path or name.startswith(path + "/") for path in exclude):
            return None
        return member

    destinations = [relative_path(value) for value in [*paths.values(), *files.values()]]
    for index, value in enumerate(destinations):
        if any(value == other or value.startswith(other + "/") or other.startswith(value + "/")
               for other in destinations[:index]):
            raise ValueError(f"Overlapping runtime output paths: {value}")
    with tempfile.TemporaryDirectory(prefix="runtime-unpack-") as temporary:
        root = Path(temporary).resolve()
        for archive in archives:
            with tarfile.open(archive, "r:*") as source:
                source.extractall(root, filter=archive_filter)
        if paths:
            for source, target in sorted(paths.items()):
                target = Path(output) / target
                target.parent.mkdir(parents=True, exist_ok=True)
                materialize(root, root / relative_path(source), target)
        else:
            materialize(root, root, Path(output))
        for source, target in sorted(files.items()):
            target = Path(output) / target
            if target.exists():
                raise ValueError(f"Additional runtime file would overwrite archive content: {target}")
            target.parent.mkdir(parents=True, exist_ok=True)
            source = Path(source).resolve(strict=True)
            # Bazel sandboxes may represent declared directory members as links
            # to their input artifacts outside this directory. These are already
            # declared inputs, unlike links extracted from untrusted archives.
            if source.is_dir():
                shutil.copytree(source, target)
                for entry in target.rglob("*"):
                    entry.chmod(0o755 if entry.is_dir() or entry.stat().st_mode & 0o111 else 0o644)
            else:
                shutil.copyfile(source, target)
                target.chmod(0o755 if source.stat().st_mode & 0o111 else 0o644)


def unpack(archive, output):
    assemble([archive], output)


if __name__ == "__main__":
    if sys.argv[1] == "--manifest":
        assemble(output=sys.argv[3], **json.loads(Path(sys.argv[2]).read_text()))
    else:
        unpack(*sys.argv[1:])
