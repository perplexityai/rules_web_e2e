"""Materialize Bazel's source-to-destination mapping as a directory artifact."""
import json
from pathlib import Path
import shutil
import sys


def prepare(output, destinations):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    for source, name in destinations.items():
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)


if __name__ == "__main__":
    prepare(sys.argv[1], json.loads(sys.argv[2]))
