"""External source-like files whose published contents must remain available."""

def _impl(ctx):
    names = ["package.ts", "package.d.ts", "package.js.map"]
    for name in names:
        ctx.file(name, "external package fixture\n")
    ctx.file("tree.bzl", '''
def _impl(ctx):
    output = ctx.actions.declare_directory(ctx.label.name)
    ctx.actions.run_shell(
        outputs = [output],
        arguments = [output.path],
        command = 'mkdir -p "$1"; printf external > "$1/package.js.map"',
    )
    return [DefaultInfo(files = depset([output]))]

tree = rule(implementation = _impl)
''')
    ctx.file("BUILD.bazel", 'load(":tree.bzl", "tree")\nexports_files(%s)\ntree(name = "package", visibility = ["//visibility:public"])\n' % repr(names))

runtime_inputs_repo = repository_rule(implementation = _impl)
