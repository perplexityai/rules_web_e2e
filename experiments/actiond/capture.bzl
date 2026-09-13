"""Throwaway REAPI-compatible screenshot action; no Docker or Testcontainers."""

def _capture_impl(ctx):
    out = ctx.actions.declare_directory("screenshots")
    ctx.actions.run(
        executable = ctx.file.node,
        arguments = [ctx.file.script.path],
        inputs = depset(ctx.files.runtime + ctx.files.playwright + [ctx.file.script]),
        outputs = [out],
        env = {
            "HOME": "/tmp",
            "TMPDIR": "/tmp",
            "LANG": "C.UTF-8",
            "TZ": "UTC",
            "FONTCONFIG_PATH": "/workspace/runtime/etc/fonts",
            "LD_LIBRARY_PATH": "/workspace/runtime/lib",
            "OUTPUT_DIR": out.path,
        },
        mnemonic = "ActiondChromiumSmoke",
    )
    return [DefaultInfo(files = depset([out]))]

capture = rule(
    implementation = _capture_impl,
    attrs = {
        "node": attr.label(allow_single_file = True),
        "script": attr.label(allow_single_file = True),
        "runtime": attr.label_list(allow_files = True),
        "playwright": attr.label_list(allow_files = True),
    },
)

def _kernel_probe_impl(ctx):
    out = ctx.actions.declare_file("kernel-probe.txt")
    ctx.actions.run(
        executable = ctx.file.binary,
        arguments = [out.path],
        outputs = [out],
        mnemonic = "ActiondKernelProbe",
    )
    return [DefaultInfo(files = depset([out]))]

kernel_probe = rule(
    implementation = _kernel_probe_impl,
    attrs = {"binary": attr.label(allow_single_file = True)},
)
