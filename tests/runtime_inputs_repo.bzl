"""External source-like files whose published contents must remain available."""

def _impl(ctx):
    names = ["package.ts", "package.d.ts", "package.js.map"]
    for name in names:
        ctx.file(name, "external package fixture\n")
    ctx.file("BUILD.bazel", "exports_files(%s)\n" % repr(names))

runtime_inputs_repo = repository_rule(implementation = _impl)
