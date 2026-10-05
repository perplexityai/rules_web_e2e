"""Validate both cross-compiled launcher bundles without executing target code."""

from pathlib import Path
import struct
import sys
import unittest

from python.runfiles import runfiles

_RUNFILES = runfiles.Create()
_BUNDLES = [(int(sys.argv[1]), [p for arg in sys.argv[2:] for p in arg.split()])]
sys.argv[1:] = []


class LauncherELF(unittest.TestCase):
    def test_machine_and_static_linkage(self):
        for machine, paths in _BUNDLES:
            binaries = [p for p in paths if Path(p).name in ("toybox", "file", "zip")]
            self.assertEqual(len(binaries), 3)
            for name in binaries:
                with self.subTest(machine=machine, binary=name):
                    data = Path(_RUNFILES.Rlocation(name)).read_bytes()
                    self.assertEqual(data[:6], b"\x7fELF\x02\x01")
                    self.assertEqual(struct.unpack_from("<H", data, 18)[0], machine)
                    offset = struct.unpack_from("<Q", data, 32)[0]
                    size, count = struct.unpack_from("<HH", data, 54)
                    for i in range(count):
                        kind, _, position, _, _, length = struct.unpack_from("<IIQQQQ", data, offset + i * size)
                        self.assertNotEqual(kind, 3, "ELF interpreter requires an external loader")
                        if kind == 2:
                            tags = [struct.unpack_from("<q", data, j)[0] for j in range(position, position + length, 16)]
                            self.assertNotIn(1, tags, "DT_NEEDED requires shared libraries")


if __name__ == "__main__":
    unittest.main()
