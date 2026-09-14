"""Assemble caller-declared browsers without hardcoded Playwright cache revisions."""
import json
from pathlib import Path
import shutil
import sys


def declared_files(inputs):
    return [file for value in inputs for file in
            (Path(value).rglob("*") if Path(value).is_dir() else [Path(value)]) if file.is_file()]


def copy_bundle(inputs, output):
    files = declared_files(inputs)
    executables = [file for file in files if file.name == "chrome-headless-shell"]
    if len(executables) != 1:
        raise ValueError("chromium must contain exactly one Chrome for Testing chrome-headless-shell executable")
    root = executables[0].parent
    for file in files:
        if file.is_relative_to(root):
            target = output / file.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, target)
            target.chmod(0o755 if file.stat().st_mode & 0o111 else 0o644)


def assemble(manifest, output):
    output = Path(output)
    if manifest["mode"] == "linux":
        shutil.copytree(manifest["system"], output, dirs_exist_ok=True)
        # Sandbox input links are copied as regular declared files.
        for directory in [output, *output.rglob("*")]:
            if directory.is_dir(): directory.chmod(0o755)
        if (output / "chromium").exists() or (output / "bin/node").exists():
            raise ValueError("system preset must not contain Chromium or Node")
        copy_bundle(manifest["chromium"], output / "chromium")
        (output / "bin").mkdir(exist_ok=True)
        shutil.copyfile(manifest["node"], output / "bin/node")
        (output / "bin/node").chmod(0o755)
        for index, font in enumerate(manifest.get("fonts", [])):
            target = output / "fonts" / "custom" / str(index)
            if Path(font).is_dir(): shutil.copytree(font, target)
            else:
                target.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(font, target / Path(font).name)
        for required in ["lib/ld-linux-x86-64.so.2", "bin/bash", "etc/fonts/fonts.conf"]:
            if not (output / required).is_file():
                raise ValueError(f"system preset is missing {required}")
    else:
        metadata = json.loads((Path(manifest["core"]) / "browsers.json").read_text())
        browsers = {entry["name"]: entry for entry in metadata["browsers"]}
        chromium = browsers["chromium-headless-shell"]
        ffmpeg = browsers["ffmpeg"]
        # Explicitly reject platform-specific revisions until supported, rather
        # than silently installing a cache Playwright would not select.
        if chromium.get("revisionOverrides") or ffmpeg.get("revisionOverrides"):
            raise ValueError("Platform-specific browser revision overrides need an updated installation helper")
        platform = manifest["platform"]
        cache = output / ("chromium_headless_shell-" + chromium["revision"])
        copy_bundle(manifest["chromium"], cache / ("chrome-headless-shell-" + platform))
        helpers = [file for file in declared_files(manifest["ffmpeg"])
                   if file.name == ("ffmpeg-linux" if platform == "linux64" else "ffmpeg-mac")]
        if len(helpers) != 1:
            raise ValueError("ffmpeg must contain exactly one executable for the selected platform")
        destination = output / ("ffmpeg-" + ffmpeg["revision"])
        destination.mkdir(parents=True)
        shutil.copyfile(helpers[0], destination / helpers[0].name)
        (destination / helpers[0].name).chmod(0o755)


if __name__ == "__main__":
    assemble(json.loads(Path(sys.argv[1]).read_text()), sys.argv[2])
