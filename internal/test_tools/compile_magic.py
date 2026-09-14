"""Compile the pinned upstream magic definitions without host shell utilities."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    compiler, output, *sources = sys.argv[1:]
    compiler = str(Path(compiler).resolve())
    output = Path(output).resolve()
    with tempfile.TemporaryDirectory(dir=output.parent) as work:
        definitions = Path(work) / "magic"
        with definitions.open("wb") as dest:
            for source in sources:
                dest.write(Path(source).read_bytes())
        result = subprocess.run([compiler, "-C", "-m", "magic"], cwd=work, capture_output=True)
        if result.returncode:
            sys.stderr.buffer.write(result.stderr)
            result.check_returncode()
        os.replace(Path(work) / "magic.mgc", output)


if __name__ == "__main__":
    main()
