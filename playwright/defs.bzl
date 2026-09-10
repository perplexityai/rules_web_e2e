"""A reusable, version-matched Playwright runtime."""

PLAYWRIGHT_IMAGE = "mcr.microsoft.com/playwright:v1.63.0-noble@sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7"

PlaywrightInfo = provider(fields = ["test", "core", "version", "image"])

def runfile(file):
    """Return a canonical manifest-relative path, including external repositories."""
    return file.short_path[3:] if file.short_path.startswith("../") else "_main/" + file.short_path

def _runtime_impl(ctx):
    parts = ctx.attr.version.split(".")
    if len(parts) != 3 or any([not p.isdigit() for p in parts]):
        fail("Playwright version must be a stable major.minor.patch version >= 1.63.0")
    if (int(parts[0]), int(parts[1]), int(parts[2])) < (1, 63, 0):
        fail("Playwright >= 1.63.0 is required")
    image = ctx.attr.image or (PLAYWRIGHT_IMAGE if ctx.attr.version == "1.63.0" else "")
    if "@sha256:" not in image:
        fail("A version override requires a matching digest-pinned browser image")
    files = ctx.files.test + ctx.files.core
    runfiles = ctx.runfiles(files = files)
    for target in [ctx.attr.test, ctx.attr.core]:
        runfiles = runfiles.merge(target[DefaultInfo].default_runfiles)
    return [
        DefaultInfo(files = depset(files), runfiles = runfiles),
        PlaywrightInfo(test = runfile(ctx.file.test), core = runfile(ctx.file.core), version = ctx.attr.version, image = image),
    ]

playwright_runtime = rule(
    implementation = _runtime_impl,
    attrs = {
        "test": attr.label(mandatory = True, allow_single_file = True),
        "core": attr.label(mandatory = True, allow_single_file = True),
        "version": attr.string(default = "1.63.0"),
        "image": attr.string(),
    },
)
