"""A pnpm-shaped graph: app -> aliased package -> transitive dependency."""

def _impl(ctx):
    packages = []
    for name, source in [("app", ctx.file.app), ("middle", ctx.file.middle), ("leaf", ctx.file.leaf)]:
        index = ctx.actions.declare_file("npm-fixture/.store/%s/node_modules/%s/index.js" % (name, name))
        ctx.actions.run_shell(
            inputs = [source],
            outputs = [index],
            arguments = [source.path, index.path],
            command = "cp \"$1\" \"$2\"",
        )
        linked = ctx.actions.declare_symlink("npm-fixture/.store/%s/node_modules/%s/linked.js" % (name, name))
        ctx.actions.symlink(output = linked, target_path = "index.js")
        packages.extend([index, linked])
    links = []
    for owner, dependency in [("app", "middle"), ("middle", "leaf")]:
        link = ctx.actions.declare_symlink("npm-fixture/.store/%s/node_modules/%s" % (owner, dependency))
        ctx.actions.symlink(output = link, target_path = "../../%s/node_modules/%s" % (dependency, dependency))
        links.append(link)
    # The original destination of this alias is deliberately not a runfile.
    # Resolve its declared action artifact without reconstructing the package.
    alias = ctx.actions.declare_file("npm-fixture/alias.cjs")
    ctx.actions.symlink(output = alias, target_file = ctx.file.alias)
    optional = ctx.actions.declare_symlink("npm-fixture/optional-platform")
    ctx.actions.symlink(output = optional, target_path = "uninstalled-platform-binding")
    files = packages + links + [alias, optional]
    return [DefaultInfo(files = depset(files), runfiles = ctx.runfiles(files = files))]

npm_fixtures = rule(
    implementation = _impl,
    attrs = {
        name: attr.label(mandatory = True, allow_single_file = [".cjs"])
        for name in ["app", "middle", "leaf", "alias"]
    },
)
