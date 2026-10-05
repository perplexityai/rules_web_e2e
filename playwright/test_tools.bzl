"""Expose the resolved coreutils to the browser layout integration test."""

def _coreutils_impl(ctx):
    return [ctx.toolchains["@bazel_lib//lib:coreutils_toolchain_type"].default]

coreutils = rule(
    implementation = _coreutils_impl,
    toolchains = ["@bazel_lib//lib:coreutils_toolchain_type"],
)
