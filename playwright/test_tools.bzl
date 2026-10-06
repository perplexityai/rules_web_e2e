"""Expose the resolved coreutils to the browser layout integration test."""

def _coreutils_impl(ctx):
    return [ctx.toolchains["@bazel_lib//lib:coreutils_toolchain_type"].default]

coreutils = rule(
    implementation = _coreutils_impl,
    toolchains = ["@bazel_lib//lib:coreutils_toolchain_type"],
)

def _bsd_tar_impl(ctx):
    return [ctx.toolchains["@tar.bzl//tar/toolchain:type"].default]

bsd_tar = rule(
    implementation = _bsd_tar_impl,
    toolchains = ["@tar.bzl//tar/toolchain:type"],
)
