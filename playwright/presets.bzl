"""Locked runtime packages; no APT resolution occurs in consuming workspaces."""

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

def _hub_impl(ctx):
    ctx.file("paths.bzl", "BROWSER_PATHS = " + repr(ctx.attr.paths) + "\n")
    ctx.file("BUILD.bazel", 'filegroup(name = "packages", srcs = %s, visibility = ["//visibility:public"])' % repr(ctx.attr.packages))

_hub = repository_rule(implementation = _hub_impl, attrs = {"packages": attr.string_list(), "paths": attr.string_dict()})

def _presets_impl(ctx):
    manifest = json.decode(ctx.read(Label("//playwright/presets:noble_20260901.json")))
    labels = {}
    for package in manifest["packages"]:
        name = "noble_20260901_" + package["name"].replace("+", "_")
        http_archive(
            name = name,
            urls = package["urls"],
            sha256 = package["sha256"],
            build_file_content = "\n".join([
                'load("@rules_web_e2e//playwright:package.bzl", "package_tar")',
                'package_tar(name = "data", src = glob(["data.tar*"])[0], visibility = ["//visibility:public"])',
            ]),
        )
        labels[package["name"]] = "@" + name + "//:data"
    _hub(
        name = "rules_web_e2e_noble_20260901",
        packages = [labels[name] for name in manifest["browserPackages"]],
        paths = manifest["paths"],
    )
    return ctx.extension_metadata(reproducible = True)

linux_presets = module_extension(implementation = _presets_impl)
