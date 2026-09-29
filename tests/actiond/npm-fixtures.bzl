"""A pnpm-shaped graph: app -> aliased package -> transitive dependency."""

def _impl(ctx):
    packages = []
    for name, code in [
        ("app", "module.exports = require('middle')"),
        ("middle", "module.exports = require('leaf')"),
        ("leaf", "module.exports = 'transitive dependency reached'"),
    ]:
        directory = ctx.actions.declare_directory("npm-fixture/.store/%s/node_modules/%s" % (name, name))
        ctx.actions.run_shell(
            outputs = [directory],
            arguments = [directory.path, code],
            command = "mkdir -p \"$1\"; printf '%s' \"$2\" > \"$1/index.js\"",
        )
        packages.append(directory)
    links = []
    for owner, dependency in [("app", "middle"), ("middle", "leaf")]:
        link = ctx.actions.declare_symlink("npm-fixture/.store/%s/node_modules/%s" % (owner, dependency))
        ctx.actions.symlink(output = link, target_path = "../../%s/node_modules/%s" % (dependency, dependency))
        links.append(link)
    # The original destination of this alias is deliberately not a runfile.
    # Its contents must be copied instead of retaining a dangling staged alias.
    actual = ctx.actions.declare_file("npm-fixture/actual.cjs")
    ctx.actions.write(actual, "module.exports = 'alias contents reached'")
    alias = ctx.actions.declare_file("npm-fixture/alias.cjs")
    ctx.actions.symlink(output = alias, target_file = actual)
    files = packages + links + [alias]
    return [DefaultInfo(files = depset(files), runfiles = ctx.runfiles(files = files))]

npm_fixtures = rule(implementation = _impl)
