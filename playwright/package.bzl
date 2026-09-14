"""Normalize a downloaded Debian package's payload with a declared decompressor."""

def _package_tar_impl(ctx):
    output = ctx.actions.declare_file(ctx.label.name + ".tar")
    if ctx.file.src.basename == "data.tar":
        ctx.actions.symlink(output = output, target_file = ctx.file.src)
    else:
        toolchain = ctx.toolchains["@bazel_lib//lib:zstd_toolchain_type"]
        ctx.actions.run(
            executable = toolchain.zstdinfo.binary,
            arguments = ["--decompress", "--force", ctx.file.src.path, "-o", output.path],
            inputs = [ctx.file.src],
            tools = toolchain.default.files,
            outputs = [output],
            mnemonic = "BrowserPackageTar",
        )
    return [DefaultInfo(files = depset([output]))]

package_tar = rule(
    implementation = _package_tar_impl,
    attrs = {"src": attr.label(mandatory = True, allow_single_file = True)},
    toolchains = ["@bazel_lib//lib:zstd_toolchain_type"],
)
