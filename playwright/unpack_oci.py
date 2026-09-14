"""Materialize a runtime from declared OCI blobs, without registry access."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import tarfile
import tempfile

from playwright.unpack_runtime import image_filter, materialize


def blob(layout, descriptor):
    digest = descriptor["digest"]
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise ValueError(f"Unsupported OCI digest: {digest}")
    file = layout / "blobs" / "sha256" / digest.split(":")[1]
    with file.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != digest.split(":")[1] or file.stat().st_size != descriptor["size"]:
        raise ValueError(f"OCI blob does not match its descriptor: {digest}")
    return file


def select_manifest(layout, architecture):
    index = json.loads((layout / "index.json").read_text())
    candidates = []

    def visit(descriptor, depth=0):
        if depth > 8:
            raise ValueError("OCI indexes are nested too deeply")
        document = json.loads(blob(layout, descriptor).read_text())
        if "manifests" in document:
            for child in document["manifests"]:
                visit(child, depth + 1)
        else:
            config = json.loads(blob(layout, document["config"]).read_text())
            if config.get("os") == "linux" and config.get("architecture") == architecture:
                candidates.append(document)

    for descriptor in index["manifests"]:
        visit(descriptor)
    if len(candidates) != 1:
        raise ValueError(f"Expected one Linux {architecture} image, found {len(candidates)}")
    return candidates[0]


def remove(file):
    if file.is_symlink() or file.is_file():
        file.unlink()
    elif file.is_dir():
        shutil.rmtree(file)


def destination(root, name):
    if name.startswith("/") or ".." in name.split("/"):
        raise ValueError(f"OCI path escapes image root: {name}")
    file = root / name
    if file == root:
        return file
    if not file.parent.resolve().is_relative_to(root):
        raise ValueError(f"OCI parent escapes image root: {name}")
    return file


def apply_layer(root, archive):
    def layer_filter(member, target):
        member = image_filter(member, target)
        # Layer application needs writable staging directories. Final directory
        # permissions are normalized when producing the Bazel tree artifact.
        return member.replace(mode=(member.mode or 0o755) | 0o700) if member.isdir() else member

    with tarfile.open(archive, "r:*") as source:
        entries = source.getmembers()
        # OCI whiteouts affect only lower layers, regardless of tar entry order.
        for entry in entries:
            name = Path(entry.name).name
            if not name.startswith(".wh."):
                continue
            marker = destination(root, entry.name)
            if not entry.isfile() or entry.size != 0 or name[4:] in ("", ".", ".."):
                raise ValueError(f"Invalid OCI whiteout: {entry.name}")
            if name == ".wh..wh..opq":
                if marker.parent.exists():
                    for child in marker.parent.iterdir():
                        remove(child)
            else:
                remove(marker.parent / name[4:])
        for entry in entries:
            if Path(entry.name).name.startswith(".wh."):
                continue
            file = destination(root, entry.name)
            if file == root or entry.name in (".", "./"):
                continue
            # Replacing an existing link must not modify its former target.
            if not (entry.isdir() and file.is_dir() and not file.is_symlink()):
                remove(file)
            source.extract(entry, root, filter=layer_filter)


def unpack_oci(layout, output, directory=".", architecture="amd64"):
    layout = Path(layout)
    if json.loads((layout / "oci-layout").read_text()).get("imageLayoutVersion") != "1.0.0":
        raise ValueError("Unsupported OCI image layout version")
    manifest = select_manifest(layout, architecture)
    with tempfile.TemporaryDirectory(prefix="oci-runtime-") as temporary:
        root = Path(temporary).resolve()
        for layer in manifest["layers"]:
            if layer["mediaType"] not in (
                "application/vnd.oci.image.layer.v1.tar",
                "application/vnd.oci.image.layer.v1.tar+gzip",
                "application/vnd.docker.image.rootfs.diff.tar.gzip",
            ):
                raise ValueError(f"Unsupported OCI layer media type: {layer['mediaType']}")
            apply_layer(root, blob(layout, layer))
        selected = root if directory == "." else destination(root, directory)
        if not selected.is_dir():
            raise ValueError(f"Missing runtime directory in OCI image: {directory}")
        materialize(root, selected, Path(output))


if __name__ == "__main__":
    unpack_oci(*sys.argv[1:])
