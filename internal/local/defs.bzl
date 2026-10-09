"""Pinned Linux namespace runner, built statically with the existing LLVM tools."""

load("//internal/test_tools:defs.bzl", "linux_tools")

def _tools_impl(ctx):
    return [DefaultInfo(files = depset([ctx.executable.bwrap]), runfiles = ctx.runfiles(files = [ctx.executable.bwrap]))]

local_tools = rule(
    implementation = _tools_impl,
    attrs = {
        "target_arch": attr.string(default = "x64", values = ["x64", "arm64"]),
        "bwrap": attr.label(default = "@bubblewrap//:bwrap", executable = True, cfg = linux_tools),
        "_allowlist_function_transition": attr.label(default = "@bazel_tools//tools/allowlists/function_transition_allowlist"),
    },
)
