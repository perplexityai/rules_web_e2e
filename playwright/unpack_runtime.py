"""Unpack a flattened image filesystem without consulting host libraries.

This consumes a filesystem tar, not an OCI layout or an ordered set of layers.
Image-root absolute links are rewritten before extraction, then all links are
materialized so the Bazel tree artifact contains only files and directories.
"""
import os
from pathlib import Path
import posixpath
import shutil
import sys
import tarfile
import tempfile


def unpack(archive, output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="runtime-unpack-") as temporary:
        root = Path(temporary)

        def image_filter(member, destination):
            if member.name.startswith("/") or ".." in member.name.split("/"):
                raise ValueError(f"Runtime archive path escapes image root: {member.name}")
            if member.name.rsplit("/", 1)[-1].startswith(".wh."):
                raise ValueError("Supply a flattened runtime archive, not OCI layers with whiteouts")
            if member.issym() and member.linkname.startswith("/"):
                target = posixpath.normpath(member.linkname).lstrip("/")
                member = member.replace(linkname=posixpath.relpath(target or ".", posixpath.dirname(member.name) or "."))
            if member.islnk() and member.linkname.startswith("/"):
                member = member.replace(linkname=posixpath.normpath(member.linkname).lstrip("/"))
            return tarfile.data_filter(member, destination)

        with tarfile.open(archive, "r:*") as source:
            source.extractall(root, filter=image_filter)

        def materialize(source, target, parents):
            try:
                resolved = source.resolve(strict=True)
            except FileNotFoundError as error:
                raise ValueError(f"Runtime contains a dangling link: {source.relative_to(root)}") from error
            if not resolved.is_relative_to(root):
                raise ValueError(f"Runtime link escapes image root: {source.relative_to(root)}")
            if resolved.is_dir():
                if resolved in parents:
                    raise ValueError(f"Runtime contains a directory link cycle: {source.relative_to(root)}")
                target.mkdir(parents=True, exist_ok=True)
                for entry in sorted(resolved.iterdir()):
                    materialize(entry, target / entry.name, parents | {resolved})
            elif resolved.is_file():
                shutil.copyfile(resolved, target)
                os.chmod(target, 0o755 if resolved.stat().st_mode & 0o111 else 0o644)
            else:
                raise ValueError(f"Runtime contains an unsupported file: {source.relative_to(root)}")

        materialize(root, output, set())


if __name__ == "__main__":
    unpack(*sys.argv[1:])
