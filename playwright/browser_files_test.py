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

    def test_linux_runtime_composes_matching_architecture_and_rejects_mixed_binaries(self):
        for arch, loader, machine in [("x64", "ld-linux-x86-64.so.2", 62), ("arm64", "ld-linux-aarch64.so.1", 183)]:
            with self.subTest(arch=arch), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                binary = bytearray(64)
                binary[:6] = b"\x7fELF\x02\x01"
                binary[18:20] = machine.to_bytes(2, "little")
                system = root / "system"
                for name in ["lib/" + loader, "bin/bash", "etc/fonts/fonts.conf", "fonts/default.ttf"]:
                    file = system / name
                    file.parent.mkdir(parents=True, exist_ok=True)
                    file.write_bytes(binary if name.startswith(("lib/", "bin/")) else name.encode())
                node = root / "node"
                node.write_bytes(binary)
                font = root / "brand.ttf"
                font.write_text("caller font")
                browser = self.bundle(root / "browser")
                (browser / "chrome-headless-shell").write_bytes(binary)
                output = root / "runtime"
                manifest = {"mode": "linux", "arch": arch, "system": str(system), "node": str(node),
                            "chromium": [str(browser)], "fonts": [str(font)]}
                assemble(manifest, output)
                self.assertEqual((output / "bin/node").read_bytes(), binary)
                self.assertEqual((output / "fonts/custom/0/brand.ttf").read_text(), "caller font")
                self.assertTrue((output / "fonts/default.ttf").exists())
                self.assertFalse(any(p.is_symlink() for p in output.rglob("*")))
                wrong = bytearray(binary)
                wrong[18:20] = (183 if machine == 62 else 62).to_bytes(2, "little")
                node.write_bytes(wrong)
                with self.assertRaisesRegex(ValueError, "node must be a Linux " + arch):
                    assemble(manifest, root / "wrong-node")
                node.write_bytes(binary)
                (system / "lib" / loader).unlink()
                with self.assertRaisesRegex(ValueError, "system preset is missing"):
                    assemble(manifest, root / "missing-loader")
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
