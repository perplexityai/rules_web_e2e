"""Generate an ESM comparison policy from declared Bazel options."""

def _matching_config_impl(ctx):
    for name in ctx.attr.options:
        if name not in ["threshold", "maxDiffPixels", "maxDiffPixelRatio"]:
            fail("Unknown VRT matching option: " + name)
    module = ctx.actions.declare_file(ctx.label.name + ".mjs")

    # Starlark has no floats. Parse JSON numeric strings without evaluating code;
    # the shared runtime validator enforces numeric types, ranges, and budgets.
    entries = [
        "%s: JSON.parse(%s)" % (json.encode(name), json.encode(value))
        for name, value in ctx.attr.options.items()
    ]
    ctx.actions.write(module, "export default {" + ", ".join(entries) + "};\n")
    return [DefaultInfo(files = depset([module]), runfiles = ctx.runfiles(files = [module]))]

matching_config = rule(
    implementation = _matching_config_impl,
    attrs = {"options": attr.string_dict()},
)
