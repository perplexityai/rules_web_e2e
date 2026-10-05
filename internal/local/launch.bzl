"""Declare local browser mounts and a shared namespace launcher."""

load("@bazel_lib//lib:paths.bzl", "to_rlocation_path")

def local_browser_launch(ctx, root, descriptor, runfiles, job):
    loader = "lib/ld-linux-" + ("x86-64" if ctx.attr.target_arch == "x64" else "aarch64") + ".so." + ("2" if ctx.attr.target_arch == "x64" else "1")
    if descriptor["bash"] != "bin/bash" or descriptor["loader"] != loader or "lib" not in descriptor["libraryDirs"]:
        fail("execution = local requires bin/bash, the standard lib/ Linux loader, and lib in library_dirs; use linux_chromium_runtime")
    bash = ctx.attr._bash_runfiles[DefaultInfo].default_runfiles
    library = [file for file in depset(
        [link.target_file for link in bash.root_symlinks.to_list()],
        transitive = [bash.files],
    ).to_list() if file.basename == "runfiles.bash"][0]
    hosts = ctx.actions.declare_file(ctx.label.name + ".hosts")
    nsswitch = ctx.actions.declare_file(ctx.label.name + ".nsswitch.conf")
    ctx.actions.write(hosts, "127.0.0.1 localhost bazel-browser\n::1 localhost bazel-browser\n")
    ctx.actions.write(nsswitch, "hosts: files\n")
    inputs = runfiles.merge(ctx.runfiles(files = [hosts, nsswitch])).merge(bash).merge(ctx.runfiles(files = [job, library, ctx.file._local_tools, ctx.file._runfiles_tools]))
    mounts = {}
    for file in inputs.files.to_list():
        source = to_rlocation_path(ctx, file)
        mounts["/runfiles/" + source] = ("link" if file.is_symlink else "file", source)
        mounts["/execroot/" + file.path] = ("alias", source)
    for link in inputs.root_symlinks.to_list():
        mounts["/runfiles/" + link.path] = ("alias", to_rlocation_path(ctx, link.target_file))
    for link in inputs.symlinks.to_list():
        mounts["/runfiles/" + ctx.workspace_name + "/" + link.path] = ("alias", to_rlocation_path(ctx, link.target_file))
    mounts["/etc/hosts"] = ("file", to_rlocation_path(ctx, hosts))
    mounts["/etc/nsswitch.conf"] = ("file", to_rlocation_path(ctx, nsswitch))
    manifest = ctx.actions.declare_file(ctx.label.name + ".mounts")
    ctx.actions.write(manifest, "".join([kind + "\0" + source + "\0" + destination + "\0" for destination, (kind, source) in mounts.items()]))
    executable = ctx.actions.declare_file(ctx.label.name)
    ctx.actions.expand_template(
        template = ctx.file._local_launcher,
        output = executable,
        is_executable = True,
        substitutions = {
            "%{library_execpath}": library.path,
            "%{library_runfile}": to_rlocation_path(ctx, library),
            "%{lookup_execpath}": ctx.file._runfiles_tools.path,
            "%{lookup_runfile}": to_rlocation_path(ctx, ctx.file._runfiles_tools),
            "%{bwrap}": to_rlocation_path(ctx, ctx.file._local_tools),
            "%{root}": to_rlocation_path(ctx, root),
            "%{mounts}": to_rlocation_path(ctx, manifest),
            "%{bootstrap}": to_rlocation_path(ctx, ctx.file._bootstrap),
            "%{job}": to_rlocation_path(ctx, job),
            "%{node}": descriptor["node"],
            "%{mode}": ctx.attr.mode,
            "%{arch}": ctx.attr.target_arch,
        },
    )
    providers = [DefaultInfo(executable = executable, runfiles = inputs.merge(ctx.runfiles(files = [manifest]))), OutputGroupInfo(inputs = inputs.files)]
    if ctx.attr.mode == "test":
        requirements = {"no-remote-exec": "1", "no-sandbox": "1"}
        if not ctx.attr.cacheable:
            requirements.update({"no-remote-cache": "1", "no-cache": "1"})
        providers += [testing.ExecutionInfo(requirements)]
    return providers
