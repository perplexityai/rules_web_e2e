"""Install the compiled suite harness as an immutable Bazel directory artifact."""
from pathlib import Path
import shutil
import sys


def prepare(output, mode, templates):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    (output / "package.json").write_text('{"type":"module"}')
    for template in map(Path, templates):
        name = template.name
        if name == "capture.js":
            if mode != "visual":
                continue
            name = ".rules-visual.spec.js"
        shutil.copyfile(template, output / name)


if __name__ == "__main__":
    prepare(sys.argv[1], sys.argv[2], sys.argv[3:])
