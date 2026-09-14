"""Exercise the real utilities and flags used by Bazel's test-setup.sh."""

import base64
import os
from pathlib import Path
import signal
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile

from python.runfiles import runfiles

_FILES = {Path(p).name: runfiles.Create().Rlocation(p) for arg in sys.argv[1:] for p in arg.split()}
sys.argv[1:] = []


class TestTools(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.env = dict(os.environ, PATH="", MAGIC=_FILES["magic.mgc"], LC_ALL="C")

    def run_tool(self, command, *args):
        prefix = [_FILES[command]] if command in ("file", "pgrep", "zip") else [_FILES["toybox"], command]
        return subprocess.check_output(prefix + list(args), cwd=self.root, env=self.env, text=True)

    def test_static_elf(self):
        for name in ("toybox", "file", "pgrep", "zip"):
            with self.subTest(name=name):
                data = Path(_FILES[name]).read_bytes()
                self.assertEqual(data[:6], b"\x7fELF\x02\x01")
                offset = struct.unpack_from("<Q", data, 32)[0]
                size, count = struct.unpack_from("<HH", data, 54)
                for i in range(count):
                    kind, _, position, _, _, length = struct.unpack_from("<IIQQQQ", data, offset + i * size)
                    self.assertNotEqual(kind, 3, "ELF interpreter requires an external loader")
                    if kind == 2:
                        tags = [struct.unpack_from("<q", data, j)[0] for j in range(position, position + length, 16)]
                        self.assertNotIn(1, tags, "DT_NEEDED requires shared libraries")

    def test_files_and_output_metadata(self):
        self.run_tool("mkdir", "-p", "outputs/nested")
        self.run_tool("touch", "outputs/nested/result.txt")
        path = self.root / "outputs/nested/result.txt"
        path.write_text("test result\n")
        self.run_tool("ln", "-s", "nested/result.txt", "outputs/link")
        self.assertEqual(self.run_tool("dirname", "outputs/nested/result.txt").strip(), "outputs/nested")
        self.assertEqual(self.run_tool("cat", "outputs/link"), "test result\n")
        self.assertEqual(self.run_tool("stat", "-c%s", "outputs/nested/result.txt").strip(), "12")
        self.assertEqual(self.run_tool("file", "-L", "-b", "--mime-type", "outputs/link").strip(), "text/plain")
        found = self.run_tool("find", "-L", "outputs", "-type", "f")
        (self.root / "unsorted").write_text(found)
        self.assertEqual(self.run_tool("sort", "unsorted").splitlines(), ["outputs/link", "outputs/nested/result.txt"])
        self.run_tool("rm", "-r", "outputs")
        self.assertFalse(path.exists())

    def test_manifest_and_signal_parsing(self):
        (self.root / "MANIFEST").write_text("workspace/test /some path/test\nother /unrelated\n")
        matched = self.run_tool("grep", "^workspace/test ", "MANIFEST")
        (self.root / "matched").write_text(matched)
        self.assertEqual(self.run_tool("sed", "s/[^ ]* //", "matched"), "/some path/test\n")
        (self.root / "signals").write_text("1) SIGHUP 2) SIGINT\n")
        self.assertEqual(self.run_tool("sed", "-E", r"s/[0-9]+\)//g", "signals"), " SIGHUP  SIGINT\n")
        self.assertTrue(self.run_tool("date", "+%s").strip().isdigit())
        self.assertTrue(self.run_tool("date", "+%F %T %Z").strip())

    def test_process_group_monitoring(self):
        process = subprocess.Popen([_FILES["toybox"], "sleep", "60"], env=self.env, start_new_session=True)
        try:
            self.assertIn(str(process.pid), self.run_tool("ps", "-p", str(process.pid)))
            self.assertIn(str(process.pid), self.run_tool("pgrep", "-a", "-g", str(process.pid)))
        finally:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=5)

    def test_screenshot_mime_and_zip(self):
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=")
        (self.root / "screenshot.png").write_bytes(png)
        (self.root / ".annotation").write_text("result")
        self.run_tool("ln", "-s", "screenshot.png", "linked.png")
        self.assertEqual(self.run_tool("file", "-L", "-b", "--mime-type", "screenshot.png").strip(), "image/png")
        self.run_tool("zip", "-qr", "outputs.zip", "--", "screenshot.png", "linked.png", ".annotation")
        with zipfile.ZipFile(self.root / "outputs.zip") as archive:
            self.assertEqual(set(archive.namelist()), {"screenshot.png", "linked.png", ".annotation"})
            self.assertEqual(archive.read("linked.png"), png)
            self.assertEqual(archive.read(".annotation"), b"result")


if __name__ == "__main__":
    unittest.main()
