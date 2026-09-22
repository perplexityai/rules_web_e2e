"""Opt-in, versioned browser environments for consuming modules."""

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

_RELEASES = {"20260921": Label("//playwright/presets:linux_amd64_20260921.json")}

def _browser_impl(ctx):
    ctx.file("manifest.json", ctx.attr.manifest)
    ctx.file("BUILD.bazel", "\n".join([
        'load("@rules_web_e2e//playwright:browser.bzl", "linux_chromium_runtime")',
        'exports_files(["manifest.json"])',
        "linux_chromium_runtime(",
        '    name = "browser",',
        '    chromium = "@%s//:files",' % ctx.attr.chromium,
        '    node = "@%s//:bin/node",' % ctx.attr.node,
        '    system = "@rules_web_e2e//playwright/presets:%s",' % ctx.attr.system,
        '    visibility = ["//visibility:public"],',
        ")",
    ]))

_browser = repository_rule(
    implementation = _browser_impl,
    attrs = {key: attr.string(mandatory = True) for key in ["chromium", "node", "system", "manifest"]},
)

def _presets_impl(ctx):
    names = {}
    for mod in ctx.modules:
        for tag in mod.tags.linux_amd64:
            if tag.release not in _RELEASES:
                fail("Unknown Linux amd64 browser preset %r; supported releases: %s" % (tag.release, ", ".join(_RELEASES)))
            if tag.name in names:
                fail("Duplicate browser preset repository %r in modules %s and %s" % (tag.name, names[tag.name], mod.name))
            names[tag.name] = mod.name
            manifest = json.decode(ctx.read(_RELEASES[tag.release]))
            for tool in ["chromium", "node"]:
                archive = manifest[tool]
                http_archive(
                    name = tag.name + "_" + tool,
                    urls = archive["urls"],
                    sha256 = archive["sha256"],
                    strip_prefix = archive["strip_prefix"],
                    build_file_content = 'filegroup(name = "files", srcs = glob(["**"]), visibility = ["//visibility:public"])' if tool == "chromium" else 'exports_files(["bin/node"])',
                )
            _browser(
                name = tag.name,
                chromium = tag.name + "_chromium",
                node = tag.name + "_node",
                system = manifest["system"],
                manifest = json.encode(manifest),
            )
    return ctx.extension_metadata(reproducible = True)

browser_presets = module_extension(
    implementation = _presets_impl,
    tag_classes = {"linux_amd64": tag_class(attrs = {
        "name": attr.string(mandatory = True),
        "release": attr.string(mandatory = True),
    })},
)
