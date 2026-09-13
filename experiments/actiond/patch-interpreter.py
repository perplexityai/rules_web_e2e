"""Point this amd64 prototype's ELF executables at a declared loader.

The replacement fits inside the existing PT_INTERP segment; no offsets move.
Unlike invoking ld.so directly, this preserves Chromium's /proc/self/exe lookup.
"""
import pathlib
import struct
import sys

interpreter = b"/workspace/ld.so\0"
for filename in sys.argv[1:]:
    path = pathlib.Path(filename)
    data = bytearray(path.read_bytes())
    assert data[:6] == b"\x7fELF\x02\x01", "expected ELF64 little endian"
    assert struct.unpack_from("<H", data, 18)[0] == 62, "expected amd64"
    offset = struct.unpack_from("<Q", data, 32)[0]
    size, count = struct.unpack_from("<HH", data, 54)
    for index in range(count):
        header = offset + index * size
        if struct.unpack_from("<I", data, header)[0] != 3:  # PT_INTERP
            continue
        start = struct.unpack_from("<Q", data, header + 8)[0]
        available = struct.unpack_from("<Q", data, header + 32)[0]
        assert len(interpreter) <= available, "replacement interpreter does not fit"
        data[start:start + available] = interpreter.ljust(available, b"\0")
        path.write_bytes(data)
        break
    else:
        raise ValueError(f"No ELF interpreter in {path}")
