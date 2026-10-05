"""Public helpers for declared Chromium and Playwright browser installations."""

load("@bazel_lib//lib:paths.bzl", "to_rlocation_path")
load(":assembly.bzl", "BROWSER_ASSEMBLY_TOOLCHAINS", "browser_directory")
load(":defs.bzl", "BrowserRuntimeInfo", "PlaywrightInfo")

def _linux_impl(ctx):
    if not ctx.file.system.is_directory:
        fail("system must provide a declared runtime directory")
    output = browser_directory(ctx, {
        "mode": "linux",
        "arch": ctx.attr.arch,
        "chromium": [file.path for file in ctx.files.chromium],
        "node": ctx.file.node.path,
        "ffmpeg": [file.path for file in ctx.files.ffmpeg],
        "system": ctx.file.system.path,
        "fonts": [file.path for file in ctx.files.fonts],
    }, ctx.files.chromium + ctx.files.ffmpeg + [ctx.file.node, ctx.file.system] + ctx.files.fonts)
    return [
        DefaultInfo(files = depset([output]), runfiles = ctx.runfiles(files = [output])),
        BrowserRuntimeInfo(root_file = output, descriptor = {
            "root": to_rlocation_path(ctx, output),
            "executable": "chromium/chrome-headless-shell",
            "node": "bin/node",
            "ffmpeg": "bin/ffmpeg-linux" if ctx.files.ffmpeg else "",
            "loader": "lib/ld-linux-x86-64.so.2" if ctx.attr.arch == "x64" else "lib/ld-linux-aarch64.so.1",
            "bash": "bin/bash",
            "libraryDirs": ["lib"],
            "fontconfig": "etc/fonts",
            "arch": ctx.attr.arch,
        }),
    ]

_linux_chromium_runtime = rule(
    implementation = _linux_impl,
    toolchains = BROWSER_ASSEMBLY_TOOLCHAINS,
    doc = "Assemble a Linux x64 or ARM64 VRT runtime from caller-pinned Chrome for Testing and Node.",
    attrs = {
        "chromium": attr.label(mandatory = True, allow_files = True, doc = "Headless-shell files or directory, e.g. rules_browsers :info."),
        "node": attr.label(mandatory = True, allow_single_file = True, doc = "Matching Linux Node ELF, e.g. rules_nodejs :node_bin."),
        "ffmpeg": attr.label(allow_files = True, doc = "Pinned Playwright FFmpeg bundle for video recording."),
        "arch": attr.string(default = "x64", values = ["x64", "arm64"]),
        "system": attr.label(mandatory = True, allow_single_file = True, doc = "Versioned libraries, shell and font preset; excludes browser and Node."),
        "fonts": attr.label_list(allow_files = True, doc = "Additional declared font files/directories."),
        "_copy_layout": attr.label(default = Label("//playwright:copy_layout.sh"), allow_single_file = True),
        "_browser_files": attr.label(default = Label("//playwright:browser_files"), executable = True, cfg = "exec"),
    },
)

def linux_chromium_runtime(name, arch = "x64", system = None, **kwargs):
    """Assemble a browser with the matching default Linux system preset."""
    if arch not in ["x64", "arm64"]:
        fail("arch must be x64 or arm64")
    _linux_chromium_runtime(
        name = name,
        arch = arch,
        system = system or Label("//playwright/presets:noble_20260901" + ("_arm64" if arch == "arm64" else "")),
        **kwargs
    )

def _installation_impl(ctx):
    playwright = ctx.attr.playwright[PlaywrightInfo]
    core = playwright.core_file
    if ctx.target_platform_has_constraint(ctx.attr._linux[platform_common.ConstraintValueInfo]):
        platform = "linux64"
        if not ctx.target_platform_has_constraint(ctx.attr._x64[platform_common.ConstraintValueInfo]):
            fail("Chrome for Testing host installation supports Linux x64 and macOS x64/arm64")
    elif ctx.target_platform_has_constraint(ctx.attr._mac[platform_common.ConstraintValueInfo]):
        platform = "mac-arm64" if ctx.target_platform_has_constraint(ctx.attr._arm64[platform_common.ConstraintValueInfo]) else "mac-x64"
    else:
        fail("Chrome for Testing host installation supports Linux x64 and macOS x64/arm64")
    output = browser_directory(ctx, {
        "mode": "installation",
        "core": core.path,
        "chromium": [file.path for file in ctx.files.chromium],
        "ffmpeg": [file.path for file in ctx.files.ffmpeg],
        "platform": platform,
    }, ctx.files.chromium + ctx.files.ffmpeg + [core])
    return [DefaultInfo(files = depset([output]), runfiles = ctx.runfiles(files = [output]))]

playwright_browser_installation = rule(
    implementation = _installation_impl,
    toolchains = BROWSER_ASSEMBLY_TOOLCHAINS,
    doc = "Lay out declared host Chromium/FFmpeg using the selected Playwright package's browser revisions.",
    attrs = {
        "chromium": attr.label(mandatory = True, allow_files = True),
        "ffmpeg": attr.label(mandatory = True, allow_files = True),
        "playwright": attr.label(default = Label("//runtime:playwright"), providers = [PlaywrightInfo]),
        "_copy_layout": attr.label(default = Label("//playwright:copy_layout.sh"), allow_single_file = True),
        "_browser_files": attr.label(default = Label("//playwright:browser_files"), executable = True, cfg = "exec"),
        "_linux": attr.label(default = "@platforms//os:linux"),
        "_mac": attr.label(default = "@platforms//os:macos"),
        "_x64": attr.label(default = "@platforms//cpu:x86_64"),
        "_arm64": attr.label(default = "@platforms//cpu:arm64"),
    },
)
