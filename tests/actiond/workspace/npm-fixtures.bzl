"""A pnpm-shaped graph: app -> aliased package -> transitive dependency."""

def _impl(ctx):
    packages = []
    for name, source in [("app", ctx.file.app), ("middle", ctx.file.middle), ("leaf", ctx.file.leaf)]:
        directory = ctx.actions.declare_directory("npm-fixture/.store/%s/node_modules/%s" % (name, name))
        ctx.actions.run_shell(
            inputs = [source],
            outputs = [directory],
            arguments = [directory.path, source.path],
            command = "mkdir -p \"$1\"; cp \"$2\" \"$1/index.js\"",
        )
        packages.append(directory)
    links = []
    for owner, dependency in [("app", "middle"), ("middle", "leaf")]:
        link = ctx.actions.declare_symlink("npm-fixture/.store/%s/node_modules/%s" % (owner, dependency))
        ctx.actions.symlink(output = link, target_path = "../../%s/node_modules/%s" % (dependency, dependency))
        links.append(link)
    # The original destination of this alias is deliberately not a runfile.
    # Its contents must be copied instead of retaining a dangling staged alias.
    alias = ctx.actions.declare_file("npm-fixture/alias.cjs")
    ctx.actions.symlink(output = alias, target_file = ctx.file.alias)
    files = packages + links + [alias]
    return [DefaultInfo(files = depset(files), runfiles = ctx.runfiles(files = files))]

npm_fixtures = rule(
    implementation = _impl,
    attrs = {
        name: attr.label(mandatory = True, allow_single_file = [".cjs"])
        for name in ["app", "middle", "leaf", "alias"]
    },
)
