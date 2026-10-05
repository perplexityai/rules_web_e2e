"""Check declared package metadata before a browser action can run."""

import json
from pathlib import Path
import sys


def validate(test, core, version, output):
    versions = [json.loads((directory / "package.json").read_text())["version"]
                for directory in (test, core)]
    if versions != [version, version]:
        raise ValueError(
            f"Playwright version mismatch: configured {version}, "
            f"test {versions[0]}, core {versions[1]}"
        )
    output.write_text(json.dumps({"version": version}) + "\n")


if __name__ == "__main__":
    validate(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4]))
