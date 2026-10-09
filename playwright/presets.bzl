"""Locked runtime packages; no APT resolution occurs in consuming workspaces."""

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

def _hub_impl(ctx):
    # Extract the inner Debian payloads together so package-to-package links resolve.
    for package in ctx.attr.packages:
        payloads = [path for path in ctx.path(package).dirname.readdir() if path.basename.startswith("data.tar")]
        if len(payloads) != 1:
            fail("Expected one Debian data archive in " + str(package))
        ctx.extract(payloads[0], output = "root")
    root = str(ctx.path("root")) + "/"
    for source, destination in ctx.attr.paths.items():
        resolved = ctx.path("root/" + source).realpath
        if not str(resolved).startswith(root) or not resolved.exists:
            fail("Preset path must resolve inside extracted packages: " + source)
        ctx.symlink(resolved, "runtime/" + destination)
    ctx.symlink(ctx.path(ctx.attr._fonts), "runtime/etc/fonts/fonts.conf")
    ctx.file("paths.bzl", "BROWSER_PATHS = " + repr(ctx.attr.paths) + "\n")
    ctx.file("BUILD.bazel", "\n".join([
        'load("@rules_web_e2e//playwright:directory.bzl", "runtime_directory")',
        'filegroup(name = "packages", srcs = %s, visibility = ["//visibility:public"])' % repr([str(package).removesuffix("BUILD.bazel") + "data" for package in ctx.attr.packages]),
        'runtime_directory(',
        '    name = "runtime",',
        '    files = {path: path.removeprefix("runtime/") for path in glob(["runtime/**"], allow_empty = False)},',
        '    visibility = ["//visibility:public"],',
        ')',
    ]))

_hub = repository_rule(implementation = _hub_impl, attrs = {
    "packages": attr.label_list(),
    "paths": attr.string_dict(),
    "_fonts": attr.label(default = Label("//playwright/presets:fonts.conf")),
})

def _presets_impl(ctx):
    for preset in ["noble_20260901", "noble_20260901_arm64"]:
        manifest = json.decode(ctx.read(Label("//playwright/presets:" + preset + ".json")))
        labels = {}
        for package in manifest["packages"]:
            name = preset + "_" + package["name"].replace("+", "_")
            mirror = "https://ports.ubuntu.com/ubuntu-ports/pool/" if preset.endswith("_arm64") else "https://archive.ubuntu.com/ubuntu/pool/"
            # Exact package hashes keep mirror fallback reproducible during snapshot outages.
            mirrors = [mirror + url.split("/pool/", 1)[1] for url in package["urls"] if url.startswith("https://snapshot.ubuntu.com/ubuntu/") and "/pool/" in url]
            http_archive(
                name = name,
                urls = package["urls"] + mirrors,
                sha256 = package["sha256"],
                build_file_content = 'filegroup(name = "data", srcs = glob(["data.tar*"], allow_empty = False), visibility = ["//visibility:public"])',
            )
            labels[package["name"]] = "@" + name + "//:BUILD.bazel"
        _hub(
            name = "rules_web_e2e_" + preset,
            packages = [labels[name] for name in manifest["browserPackages"]],
            paths = manifest["paths"],
        )
    return ctx.extension_metadata(reproducible = True)

linux_presets = module_extension(implementation = _presets_impl)
