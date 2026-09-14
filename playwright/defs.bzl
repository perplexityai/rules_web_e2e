"""A reusable, version-matched Playwright runtime."""

PLAYWRIGHT_IMAGE = "mcr.microsoft.com/playwright:v1.63.0-noble@sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7"

PlaywrightInfo = provider(fields = ["test", "core", "version"])

BrowserRuntimeInfo = provider(fields = ["descriptor"])

def _relative_path(value, name):
    if not value or value.startswith("/") or any([p in ["", ".", ".."] for p in value.split("/")]):
        fail(name + " must be a nonempty relative path without dot segments")
    return value

def _browser_runtime_impl(ctx):
    if not ctx.file.root.is_directory:
        fail("browser_runtime root must be a declared directory containing the Linux runtime")
    descriptor = {
        "root": runfile(ctx.file.root),
        "executable": _relative_path(ctx.attr.executable, "executable"),
        "node": _relative_path(ctx.attr.node, "node"),
        "libraryDirs": [_relative_path(p, "library_dirs") for p in ctx.attr.library_dirs],
        "fontconfig": _relative_path(ctx.attr.fontconfig, "fontconfig"),
        "arch": ctx.attr.arch,
    }
    return [
        DefaultInfo(files = depset([ctx.file.root]), runfiles = ctx.runfiles(files = [ctx.file.root])),
        BrowserRuntimeInfo(descriptor = descriptor),
    ]

browser_runtime = rule(
    implementation = _browser_runtime_impl,
    doc = "Caller-owned Linux Chromium, Node, libraries, and fonts for execution inside an isolated action.",
    attrs = {
        "root": attr.label(mandatory = True, allow_single_file = True),
        "executable": attr.string(mandatory = True),
        "node": attr.string(mandatory = True),
        "library_dirs": attr.string_list(mandatory = True),
        "fontconfig": attr.string(mandatory = True),
        "arch": attr.string(default = "x64", values = ["x64", "arm64"]),
    },
)

def runfile(file):
    """Return a canonical manifest-relative path, including external repositories."""
    return file.short_path[3:] if file.short_path.startswith("../") else "_main/" + file.short_path

def _runtime_impl(ctx):
    parts = ctx.attr.version.split(".")
    if len(parts) != 3 or any([not p.isdigit() for p in parts]):
        fail("Playwright version must be a stable major.minor.patch version >= 1.63.0")
    if (int(parts[0]), int(parts[1]), int(parts[2])) < (1, 63, 0):
        fail("Playwright >= 1.63.0 is required")
    files = ctx.files.test + ctx.files.core
    runfiles = ctx.runfiles(files = files)
    for target in [ctx.attr.test, ctx.attr.core]:
        runfiles = runfiles.merge(target[DefaultInfo].default_runfiles)
    return [
        DefaultInfo(files = depset(files), runfiles = runfiles),
        PlaywrightInfo(test = runfile(ctx.file.test), core = runfile(ctx.file.core), version = ctx.attr.version),
    ]

playwright_runtime = rule(
    implementation = _runtime_impl,
    attrs = {
        "test": attr.label(mandatory = True, allow_single_file = True),
        "core": attr.label(mandatory = True, allow_single_file = True),
        "version": attr.string(default = "1.63.0"),
    },
)
