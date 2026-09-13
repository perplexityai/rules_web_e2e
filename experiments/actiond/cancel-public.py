"""Cancel an executing remote capture and verify the local updater never runs."""

import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

baseline = Path("__actiond_cancel__/keep.png")
baseline.parent.mkdir(exist_ok=True)
expected = Path("__actiond_native__/saved.png").read_bytes()
baseline.write_bytes(expected)
log = Path("../results/cancellation.log")
log.parent.mkdir(exist_ok=True)
command = [
    *sys.argv[1:3], "run", "//:actiond_cancel_test.update", *sys.argv[3:],
    "--progress_report_interval=1", "--curses=no", "--color=no",
]
with log.open("w") as output:
    process = subprocess.Popen(command, stdout=output, stderr=output, start_new_session=True)
    try:
        deadline = time.monotonic() + 90
        while not re.search(r"VrtCapture actiond_cancel_test_capture.results;[^\n]*remote", log.read_text()):
            if process.poll() is not None:
                raise AssertionError(f"Capture exited before cancellation: {log.read_text()}")
            if time.monotonic() >= deadline:
                raise AssertionError(f"Capture did not start remotely: {log.read_text()}")
            time.sleep(0.2)
        os.killpg(process.pid, signal.SIGINT)
        code = process.wait(timeout=20)
        assert code in (8, 130, -signal.SIGINT), (code, log.read_text())
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
assert baseline.read_bytes() == expected
assert not (baseline.parent / "partial.png").exists()
