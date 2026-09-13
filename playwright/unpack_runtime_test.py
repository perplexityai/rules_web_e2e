import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from playwright.unpack_runtime import unpack


class UnpackRuntimeTest(unittest.TestCase):
    def archive(self, directory, entries):
        archive = directory / "runtime.tar"
        with tarfile.open(archive, "w") as output:
            for name, content, kind in entries:
                member = tarfile.TarInfo(name)
                if kind == "link":
                    member.type = tarfile.SYMTYPE
                    member.linkname = content
                    output.addfile(member)
                else:
                    data = content.encode()
                    member.size = len(data)
                    member.mode = 0o755 if kind == "executable" else 0o644
                    output.addfile(member, io.BytesIO(data))
        return archive

    def test_materializes_image_links_and_preserves_executability(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = self.archive(root, [
                ("usr/bin/node", "declared node", "executable"),
                ("usr/lib/loader", "declared loader", "file"),
                ("bin", "/usr/bin", "link"),
                ("lib64/ld-linux-x86-64.so.2", "/usr/lib/loader", "link"),
            ])
            result = root / "result"
            alias = root / "temporary-alias"
            alias.symlink_to(root.resolve(), target_is_directory=True)
            with patch.object(tempfile, "tempdir", str(alias)):
                unpack(archive, result)
            self.assertEqual((result / "bin/node").read_text(), "declared node")
            self.assertEqual((result / "lib64/ld-linux-x86-64.so.2").read_text(), "declared loader")
            self.assertEqual((result / "bin/node").stat().st_mode & 0o777, 0o755)
            self.assertFalse(any(p.is_symlink() for p in result.rglob("*")))

    def test_refuses_host_paths_dangling_links_cycles_and_unflattened_layers(self):
        for entries in [
            [("../escape", "bad", "file")],
            [("/escape", "bad", "file")],
            [("link", "../../escape", "link")],
            [("missing", "/not-in-image", "link")],
            [("loop", "/", "link")],
            [("usr/.wh.removed", "", "file")],
        ]:
            with self.subTest(entries=entries), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive = self.archive(root, entries)
                with self.assertRaises((ValueError, tarfile.FilterError, FileNotFoundError)):
                    unpack(archive, root / "result")


if __name__ == "__main__":
    unittest.main()
