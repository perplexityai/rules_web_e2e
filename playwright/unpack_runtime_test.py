import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from playwright.unpack_runtime import assemble, unpack


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

    def test_assembles_packages_with_cross_archive_links_and_declared_browser(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "a").mkdir()
            (root / "b").mkdir()
            first = self.archive(root / "a", [
                ("etc/fonts/conf.d/alias.conf", "/usr/share/fontconfig/alias.conf", "link"),
                ("unrelated/loop", "/unrelated", "link"),
            ])
            second = self.archive(root / "b", [
                ("usr/share/fontconfig/alias.conf", "font policy", "file"),
                ("usr/bin/bash", "shell", "executable"),
            ])
            browser = root / "browser"
            browser.mkdir()
            (browser / "chrome").write_text("browser")
            (browser / "chrome").chmod(0o755)
            output = root / "output"
            assemble([first, second], output,
                     paths={"etc/fonts/conf.d": "config", "usr/bin/bash": "bin/bash"},
                     files={str(browser): "chromium"})
            self.assertEqual((output / "config/alias.conf").read_text(), "font policy")
            self.assertEqual((output / "chromium/chrome").read_text(), "browser")
            self.assertEqual((output / "chromium/chrome").stat().st_mode & 0o777, 0o755)
            self.assertFalse((output / "unrelated").exists())
            self.assertFalse(any(p.is_symlink() for p in output.rglob("*")))

    def test_selection_rejects_escape_overlap_missing_and_selected_cycle(self):
        for paths, files in [
            ({"../escape": "safe"}, {}),
            ({"node": "../escape"}, {}),
            ({"node": "/escape"}, {}),
            ({"node": "bin", "loop": "bin/child"}, {}),
            ({"node": "bin/node"}, {"unused": "bin/node"}),
            ({"missing": "missing"}, {}),
            ({"loop": "loop"}, {}),
        ]:
            with self.subTest(paths=paths), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive = self.archive(root, [("node", "binary", "file"), ("loop", "/", "link")])
                with self.assertRaises(ValueError):
                    assemble([archive], root / "output", paths, files)

    def test_additional_file_cannot_replace_unfiltered_archive_content(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = self.archive(root, [("node", "original", "file")])
            replacement = root / "replacement"
            replacement.write_text("replacement")
            with self.assertRaisesRegex(ValueError, "overwrite"):
                assemble([archive], root / "output", files={str(replacement): "node"})

    def test_excludes_packages_without_borrowing_excluded_link_targets(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = self.archive(root, [
                ("fonts/keep/font.ttf", "kept", "file"),
                ("fonts/remove/font.ttf", "removed", "file"),
                ("alias", "/fonts/remove/font.ttf", "link"),
            ])
            output = root / "output"
            assemble([archive], output, paths={"fonts": "fonts"}, exclude=["fonts/remove"])
            self.assertEqual((output / "fonts/keep/font.ttf").read_text(), "kept")
            self.assertFalse((output / "fonts/remove").exists())
            with self.assertRaisesRegex(ValueError, "dangling"):
                assemble([archive], root / "bad", paths={"alias": "alias"}, exclude=["fonts/remove"])
            with self.assertRaisesRegex(ValueError, "relative"):
                assemble([archive], root / "escape", exclude=["../outside"])


if __name__ == "__main__":
    unittest.main()
