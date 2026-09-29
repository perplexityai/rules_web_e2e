"""Generate an ESM comparison policy from declared Bazel options."""

def _matching_config_impl(ctx):
    for name in ctx.attr.options:
        if name not in ["threshold", "maxDiffPixels", "maxDiffPixelRatio"]:
            fail("Unknown VRT matching option: " + name)
    module = ctx.actions.declare_file(ctx.label.name + ".mjs")

    # Starlark has no floats. Parse JSON numeric strings without evaluating code;
    # the shared runtime validator enforces numeric types, ranges, and budgets.
    ctx.actions.expand_template(
        template = ctx.file._template,
        output = module,
        substitutions = {"__RULES_WEB_E2E_MATCHING_OPTIONS__": json.encode(ctx.attr.options)},
    )
    return [DefaultInfo(files = depset([module]), runfiles = ctx.runfiles(files = [module]))]

matching_config = rule(
    implementation = _matching_config_impl,
    attrs = {
        "options": attr.string_dict(),
        "_template": attr.label(default = Label("//internal:matching-config.mjs"), allow_single_file = True),
    },
)
