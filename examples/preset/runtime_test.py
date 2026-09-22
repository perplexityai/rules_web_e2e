"""Execute the assembled preset binaries without host library search paths."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

_RUNTIME = Path(sys.argv.pop(1)).resolve()
_MANIFEST = json.loads(Path(sys.argv.pop(1)).read_text())


class PresetRuntimeTest(unittest.TestCase):
    def test_declared_binaries(self):
        for binary, expected in [
            ("bin/node", "v" + _MANIFEST["node"]["version"]),
            ("chromium/chrome-headless-shell", _MANIFEST["chromium"]["version"]),
        ]:
            with self.subTest(binary=binary):
                result = subprocess.check_output([
                    str(_RUNTIME / "lib/ld-linux-x86-64.so.2"),
                    "--library-path", str(_RUNTIME / "lib"),
                    str(_RUNTIME / binary), "--version",
                ], env={"PATH": "", "LANG": "C"}, text=True)
                self.assertIn(expected, result.split())


if __name__ == "__main__":
    unittest.main()
