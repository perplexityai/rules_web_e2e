"""The supported Linux amd64 actiond release, acquired only by worker users."""

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_file")

def _worker_impl(ctx):
    release = json.decode(ctx.read(Label("//worker:linux_amd64.json")))
    http_file(
        name = "actiond_linux_amd64",
        urls = [release["url"]],
        sha256 = release["sha256"],
        downloaded_file_path = "actiond",
        executable = True,
    )
    return ctx.extension_metadata(reproducible = True)

workers = module_extension(implementation = _worker_impl)
