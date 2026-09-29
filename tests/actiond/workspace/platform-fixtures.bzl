"""Build the platform-specific runfiles that previously failed before Chromium."""

def _impl(ctx):
    optional = ctx.actions.declare_symlink("platform/optional-darwin-binding")
    ctx.actions.symlink(output = optional, target_path = "missing-darwin-package")
    foreign = ctx.actions.declare_file("platform/foreign-elf32")
    # Enough of an ELF32 header to identify a foreign executable. Never execute it.
    ctx.actions.write(foreign, "\177ELF\001\001" + "\000" * 58, is_executable = True)
    return [DefaultInfo(files = depset([optional, foreign]), runfiles = ctx.runfiles(files = [optional, foreign]))]

platform_fixtures = rule(implementation = _impl)
