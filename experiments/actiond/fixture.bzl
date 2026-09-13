"""Build a caller-owned OCI fixture from the example's declared runtime tar."""

def _image_impl(ctx):
    image = ctx.actions.declare_directory(ctx.label.name)
    ctx.actions.run(
        executable = ctx.executable._tool,
        arguments = [ctx.file.archive.path, image.path],
        inputs = [ctx.file.archive],
        tools = [ctx.attr._tool[DefaultInfo].files_to_run],
        outputs = [image],
        mnemonic = "VrtFixtureImage",
    )
    return [DefaultInfo(files = depset([image]))]

runtime_image = rule(
    implementation = _image_impl,
    attrs = {
        "archive": attr.label(mandatory = True, allow_single_file = True),
        "_tool": attr.label(default = Label("//experiments/actiond:fixture_image"), executable = True, cfg = "exec"),
    },
)
