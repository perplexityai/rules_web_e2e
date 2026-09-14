import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from playwright.unpack_oci import unpack_oci


class OciRuntimeTest(unittest.TestCase):
    def image(self, root, layers, architecture="amd64"):
        layout = root / "image"
        blobs = layout / "blobs/sha256"
        blobs.mkdir(parents=True)
        (layout / "oci-layout").write_text('{"imageLayoutVersion":"1.0.0"}')

        def put(data, media):
            digest = hashlib.sha256(data).hexdigest()
            (blobs / digest).write_bytes(data)
            return {"digest": "sha256:" + digest, "size": len(data), "mediaType": media}

        descriptors = []
        for entries in layers:
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode="w:gz") as archive:
                for name, value, kind in entries:
                    member = tarfile.TarInfo(name)
                    if kind in ("link", "hardlink"):
                        member.type = tarfile.SYMTYPE if kind == "link" else tarfile.LNKTYPE
                        member.linkname = value
                        archive.addfile(member)
                    else:
                        content = value.encode()
                        member.size = len(content)
                        member.mode = 0o755
                        archive.addfile(member, io.BytesIO(content))
            descriptors.append(put(data.getvalue(), "application/vnd.oci.image.layer.v1.tar+gzip"))
        config = put(json.dumps({"os": "linux", "architecture": architecture}).encode(), "application/vnd.oci.image.config.v1+json")
        manifest = put(json.dumps({"schemaVersion": 2, "config": config, "layers": descriptors}).encode(), "application/vnd.oci.image.manifest.v1+json")
        (layout / "index.json").write_text(json.dumps({"schemaVersion": 2, "manifests": [manifest]}))
        return layout, descriptors

    def test_layers_whiteouts_hardlinks_and_replaced_symlinks(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            layout, _ = self.image(root, [
                [("runtime/bin/node", "old", "file"),
                 ("runtime/bin/alias", "runtime/bin/node", "hardlink"),
                 ("runtime/fonts/obsolete", "old font", "file"),
                 ("runtime/link", "/runtime/bin/node", "link")],
                [("runtime/fonts/current", "new font", "file"),
                 ("runtime/fonts/.wh..wh..opq", "", "file"),
                 ("runtime/bin/.wh.node", "", "file"),
                 ("runtime/bin/node", "new", "file"),
                 ("runtime/link", "replacement", "file")],
            ])
            output = root / "output"
            alias = root / "temporary-alias"
            alias.symlink_to(root.resolve(), target_is_directory=True)
            with patch.object(tempfile, "tempdir", str(alias)):
                unpack_oci(layout, output, "runtime")
            self.assertEqual((output / "bin/node").read_text(), "new")
            self.assertEqual((output / "bin/alias").read_text(), "old")
            self.assertEqual((output / "link").read_text(), "replacement")
            self.assertEqual([p.name for p in (output / "fonts").iterdir()], ["current"])
            self.assertEqual((output / "bin/node").stat().st_mode & 0o777, 0o755)

    def test_rejects_wrong_platform_and_corrupt_blob(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            layout, descriptors = self.image(root, [[("runtime/node", "node", "file")]], "arm64")
            with self.assertRaisesRegex(ValueError, "Expected one Linux amd64"):
                unpack_oci(layout, root / "output")
            digest = descriptors[0]["digest"].split(":")[1]
            (layout / "blobs/sha256" / digest).write_bytes(b"corrupt")
            with self.assertRaisesRegex(ValueError, "does not match"):
                unpack_oci(layout, root / "output", architecture="arm64")

    def test_whiteouts_and_links_cannot_escape_the_image(self):
        for entries in [
            [(".wh...", "", "file")],
            [("../.wh.outside", "", "file")],
            [("runtime/link", "../../outside", "link")],
        ]:
            with self.subTest(entries=entries), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                keep = root / "keep"
                keep.write_text("keep")
                layout, _ = self.image(root, [entries])
                with self.assertRaises((ValueError, tarfile.FilterError)):
                    unpack_oci(layout, root / "output")
                self.assertEqual(keep.read_text(), "keep")


if __name__ == "__main__":
    unittest.main()
