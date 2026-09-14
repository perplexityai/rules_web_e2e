import json
from pathlib import Path
import tempfile
import unittest

from playwright.browser_files import assemble


class BrowserFilesTest(unittest.TestCase):
    def bundle(self, root):
        root.mkdir()
        (root / "chrome-headless-shell").write_text("declared browser")
        (root / "chrome-headless-shell").chmod(0o755)
        (root / "icudtl.dat").write_text("browser resources")
        return root

    def test_installation_follows_selected_playwright_metadata_on_each_platform(self):
        for platform in ["linux64", "mac-x64", "mac-arm64"]:
            with self.subTest(platform=platform), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                browser = self.bundle(root / "download")
                core = root / "core"
                core.mkdir()
                (core / "browsers.json").write_text(json.dumps({"browsers": [
                    {"name": "chromium-headless-shell", "revision": "4321"},
                    {"name": "ffmpeg", "revision": "7654"},
                ]}))
                ffmpeg = root / ("ffmpeg-linux" if platform == "linux64" else "ffmpeg-mac")
                ffmpeg.write_text("video helper")
                output = root / "installation"
                assemble({"mode": "installation", "core": str(core), "platform": platform,
                          "chromium": [str(p) for p in browser.iterdir()], "ffmpeg": [str(ffmpeg)]}, output)
                installed = output / "chromium_headless_shell-4321" / ("chrome-headless-shell-" + platform)
                self.assertEqual((installed / "chrome-headless-shell").read_text(), "declared browser")
                self.assertEqual((installed / "icudtl.dat").read_text(), "browser resources")
                self.assertEqual((output / "ffmpeg-7654" / ffmpeg.name).read_text(), "video helper")
                self.assertTrue((installed / "chrome-headless-shell").stat().st_mode & 0o111)

    def test_linux_runtime_composes_custom_system_node_and_fonts(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            system = root / "system"
            for name in ["lib/ld-linux-x86-64.so.2", "bin/bash", "etc/fonts/fonts.conf", "fonts/default.ttf"]:
                file = system / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(name)
            node = root / "node"
            node.write_text("caller node")
            font = root / "brand.ttf"
            font.write_text("caller font")
            browser = self.bundle(root / "browser")
            output = root / "runtime"
            manifest = {"mode": "linux", "system": str(system), "node": str(node),
                        "chromium": [str(browser)], "fonts": [str(font)]}
            assemble(manifest, output)
            self.assertEqual((output / "bin/node").read_text(), "caller node")
            self.assertEqual((output / "fonts/custom/0/brand.ttf").read_text(), "caller font")
            self.assertTrue((output / "fonts/default.ttf").exists())
            self.assertFalse(any(p.is_symlink() for p in output.rglob("*")))
            (system / "bin/node").write_text("unexpected node")
            with self.assertRaisesRegex(ValueError, "must not contain"):
                assemble(manifest, root / "invalid")

    def test_ambiguous_browser_bundle_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            from playwright.browser_files import copy_bundle
            with self.assertRaisesRegex(ValueError, "exactly one"):
                copy_bundle([str(self.bundle(root / "first")), str(self.bundle(root / "second"))], root / "out")


if __name__ == "__main__":
    unittest.main()
