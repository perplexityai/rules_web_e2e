"""Native browser tests and VRT artifact-producing actions."""

load("@bazel_lib//lib:paths.bzl", "to_rlocation_path")
load("@web_e2e_worker_identity//:defs.bzl", "WORKER_SHA256")
load("//internal/local:launch.bzl", "local_browser_launch")
load("//internal/test_tools:defs.bzl", "TestToolsInfo")
load("//playwright:defs.bzl", "BrowserRuntimeInfo")
load(":snapshots.bzl", "source_update")

def _linux_impl(_settings, attr):
    return {"//command_line_option:platforms": [str(attr.target_platform)]}

_linux = transition(
    implementation = _linux_impl,
    inputs = [],
    outputs = ["//command_line_option:platforms"],
)

LinuxPlatformInfo = provider(fields = ["arch"])

def _platform_impl(ctx):
    if not ctx.target_platform_has_constraint(ctx.attr._linux[platform_common.ConstraintValueInfo]):
        fail("VRT target_platform must select Linux")
    for arch in ["x64", "arm64"]:
        if ctx.target_platform_has_constraint(getattr(ctx.attr, "_" + arch)[platform_common.ConstraintValueInfo]):
            return [LinuxPlatformInfo(arch = arch)]
    fail("VRT target_platform must select x64 or arm64")

linux_platform = rule(
    implementation = _platform_impl,
    attrs = {
        "_linux": attr.label(default = "@platforms//os:linux"),
        "_x64": attr.label(default = "@platforms//cpu:x86_64"),
        "_arm64": attr.label(default = "@platforms//cpu:arm64"),
    },
)

# Prefer worker glibc to bundled libc so its loader and libraries stay paired.
_WORKER_LIBRARIES = ":".join([
    "/lib/x86_64-linux-gnu",
    "/lib/aarch64-linux-gnu",
    "/lib64",
    "/lib",
    "/usr/lib/x86_64-linux-gnu",
    "/usr/lib/aarch64-linux-gnu",
    "/usr/lib",
])

def _library_path(root, descriptor):
    return _WORKER_LIBRARIES + ":" + ":".join([root + "/" + p for p in descriptor["libraryDirs"]])

def _native_test(ctx, root, descriptor, runfiles, job):
    executable = ctx.actions.declare_file(ctx.label.name)
    setup = ctx.actions.declare_file(ctx.label.name + ".bash-env")
    tools = ctx.attr._test_tools[TestToolsInfo]

    # Bazel itself invokes /bin/bash before our executable. actiond supplies
    # its pinned static shell; BASH_ENV supplies the wrapper's declared tools.
    ctx.actions.write(setup, "\n".join([
        "unset BASH_ENV",
        'case "$TEST_SRCDIR" in /*) ;; *) export TEST_SRCDIR="$PWD/$TEST_SRCDIR" ;; esac',
        'source "$TEST_SRCDIR/%s"' % to_rlocation_path(ctx, tools.shell_setup),
    ]) + "\n")
    ctx.actions.write(executable, "\n".join([
        "#!/bin/bash",
        "set -euo pipefail",
        'root="$TEST_SRCDIR/%s"' % to_rlocation_path(ctx, root),
        'export LD_LIBRARY_PATH="%s"' % _library_path("$root", descriptor),
        'exec "$root/%s" "$TEST_SRCDIR/%s" "$TEST_SRCDIR/%s" "$@"' % (
            descriptor["node"],
            to_rlocation_path(ctx, ctx.file._bootstrap),
            to_rlocation_path(ctx, job),
        ),
    ]) + "\n", is_executable = True)
    inputs = [executable, job, setup] + ctx.attr._test_tools[DefaultInfo].files.to_list()
    runfiles = runfiles.merge(ctx.runfiles(files = inputs))
    return [
        DefaultInfo(executable = executable, runfiles = runfiles),
        OutputGroupInfo(inputs = runfiles.files),
        testing.TestEnvironment({
            "BASH_ENV": executable.path + ".runfiles/" + to_rlocation_path(ctx, setup),
            "USER": "test",
            "LANG": "C.UTF-8",
            "TZ": "UTC",
            "VRT_HOST_EXECUTION": "1" if ctx.attr.host_vrt else "0",
        }),
        testing.ExecutionInfo({"no-remote": "1"} if ctx.attr.host_vrt else {"no-local": "1"}),
    ]

def _remote_impl(ctx):
    native_test = ctx.attr.mode == "test"
    browser = ctx.attr.browser[0][BrowserRuntimeInfo]
    if browser.descriptor["arch"] != ctx.attr.target_arch:
        fail("browser runtime arch must match target_arch (" + ctx.attr.target_arch + ")")
    if ctx.attr._platform[0][LinuxPlatformInfo].arch != ctx.attr.target_arch:
        fail("target_platform CPU must match target_arch")
    root = ctx.file.browser
    runfiles = ctx.runfiles(files = [root, ctx.file._bootstrap])
    for target in [ctx.attr.inputs[0], ctx.attr._runtime, ctx.attr._runner]:
        info = target[DefaultInfo]
        runfiles = runfiles.merge(info.default_runfiles).merge(ctx.runfiles(transitive_files = info.files))
    locations = ctx.attr.data + ctx.attr.inputs
    env = {key: ctx.expand_location(value, targets = locations) for key, value in ctx.attr.env.items() if key != "VRT_DESCRIPTOR"}
    env["VRT_DESCRIPTOR"] = to_rlocation_path(ctx, ctx.file.inputs)
    job = ctx.actions.declare_file(ctx.label.name + ".job.json")
    ctx.actions.write(job, json.encode({
        "runner": to_rlocation_path(ctx, ctx.file._runner),
        "env": env,
        "args": [] if native_test else [ctx.expand_location(value, targets = locations) for value in ctx.attr.args],
        "output": "",
        "mode": ctx.attr.mode,
        # Include caller execution properties in each cache layer.
        "execution_properties": ctx.attr.exec_properties if ctx.attr.execution == "local" else {},
    }))
    descriptor = browser.descriptor
    if ctx.attr.execution == "local":
        return local_browser_launch(ctx, root, descriptor, runfiles, job)
    if native_test:
        return _native_test(ctx, root, descriptor, runfiles, job)
    executable = ctx.actions.declare_file(ctx.label.name)
    bash_runfiles = ctx.attr._bash_runfiles[DefaultInfo].default_runfiles
    library_files = depset(
        [link.target_file for link in bash_runfiles.root_symlinks.to_list()],
        transitive = [bash_runfiles.files],
    ).to_list()
    library = [file for file in library_files if file.basename == "runfiles.bash"][0]
    toybox = ctx.file._runfiles_tools
    ctx.actions.expand_template(
        template = ctx.file._capture_launcher,
        output = executable,
        substitutions = {
            "%{runfiles_commands}": "\n".join([
                '%s() { "$execroot/%s" %s "$@"; }' % (command, toybox.path, command)
                for command in ["cut", "grep", "sed", "tr", "uname"]
            ]),
            "%{runfiles_library}": library.path,
            "%{runtime}": to_rlocation_path(ctx, root),
            "%{bootstrap}": to_rlocation_path(ctx, ctx.file._bootstrap),
            "%{job}": to_rlocation_path(ctx, job),
            "%{library_path}": _library_path("$root", descriptor),
            "%{node}": descriptor["node"],
        },
        is_executable = True,
    )
    return [DefaultInfo(executable = executable, runfiles = runfiles.merge(bash_runfiles).merge(ctx.runfiles(files = [job, library, toybox])))]

def _artifact_impl(ctx):
    output = ctx.actions.declare_directory(ctx.label.name + ".results")
    launcher = ctx.attr.launcher[DefaultInfo]
    requirements = {"no-local": "1"}
    if ctx.attr.host_vrt or ctx.attr.execution == "local":
        requirements = {"no-remote": "1", "no-cache": "1"}
    if ctx.attr.execution == "local":
        requirements = {"no-remote-exec": "1", "no-sandbox": "1"}
        if not ctx.attr.cacheable:
            requirements.update({"no-remote-cache": "1", "no-cache": "1"})
    ctx.actions.run(
        executable = launcher.files_to_run,
        # Preserve declared execpaths used by expanded env/args, not only rlocations.
        inputs = launcher.default_runfiles.files,
        arguments = [output.path],
        outputs = [output],
        env = {
            "HOME": "/tmp",
            "TMPDIR": "/tmp",
            "LANG": "C.UTF-8",
            "TZ": "UTC",
            "VRT_HOST_EXECUTION": "1" if ctx.attr.host_vrt else "0",
        },
        execution_requirements = requirements,
        mnemonic = "VrtCapture",
    )
    return [
        DefaultInfo(files = depset([output]), runfiles = ctx.runfiles(files = [output])),
        OutputGroupInfo(inputs = depset(transitive = [launcher.files, launcher.default_runfiles.files])),
    ]

_artifact = rule(
    implementation = _artifact_impl,
    attrs = {
        "launcher": attr.label(executable = True, cfg = "target", mandatory = True),
        "host_vrt": attr.bool(),
        "execution": attr.string(default = "actiond"),
        "cacheable": attr.bool(),
    },
)

_attrs = {
    "inputs": attr.label(mandatory = True, allow_single_file = True, cfg = _linux),
    "browser": attr.label(mandatory = True, providers = [BrowserRuntimeInfo], allow_single_file = True, cfg = _linux),
    "data": attr.label_list(allow_files = True, cfg = _linux),
    "target_platform": attr.label(mandatory = True),
    "_platform": attr.label(default = Label("//internal:target_platform"), cfg = _linux),
    "target_arch": attr.string(mandatory = True, values = ["x64", "arm64"]),
    "env": attr.string_dict(),
    "mode": attr.string(mandatory = True, values = ["capture", "test"]),
    "host_vrt": attr.bool(default = False),
    "execution": attr.string(default = "actiond"),
    "cacheable": attr.bool(),
    "_local_launcher": attr.label(default = Label("//internal/local:launcher.sh.tpl"), allow_single_file = True),
    "local_tools": attr.label(allow_single_file = True),
    "_bash_runfiles": attr.label(default = "@rules_shell//shell/runfiles"),
    "_runfiles_tools": attr.label(default = Label("//internal/test_tools:runfiles_tools"), allow_single_file = True),
    "_runtime": attr.label(default = Label("//runtime:files")),
    "_runner": attr.label(default = Label("//runtime:runner_entry"), allow_single_file = True),
    "_bootstrap": attr.label(default = Label("//runtime:remote_runner_entry"), allow_single_file = True),
    "_allowlist_function_transition": attr.label(default = "@bazel_tools//tools/allowlists/function_transition_allowlist"),
}
_capture_attrs = dict(_attrs)
_capture_attrs["_capture_launcher"] = attr.label(default = Label("//internal:capture-launcher.sh.tpl"), allow_single_file = True)
_remote = rule(implementation = _remote_impl, attrs = _capture_attrs, executable = True)
_arm64_capture_attrs = dict(_capture_attrs)
_arm64_capture_attrs["_runfiles_tools"] = attr.label(default = Label("//internal/test_tools:runfiles_tools_arm64"), allow_single_file = True)
_remote_arm64 = rule(implementation = _remote_impl, attrs = _arm64_capture_attrs, executable = True)

_test_attrs = dict(_attrs)
_test_attrs["_test_tools"] = attr.label(default = Label("//internal/test_tools:tools"), providers = [TestToolsInfo])
_native_browser_test = rule(
    implementation = _remote_impl,
    attrs = _test_attrs,
    test = True,
    exec_groups = {"test": exec_group(exec_compatible_with = [str(Label("@platforms//os:linux")), str(Label("@platforms//cpu:x86_64"))])},
)

_arm64_test_attrs = dict(_test_attrs)
_arm64_test_attrs["_runfiles_tools"] = attr.label(default = Label("//internal/test_tools:runfiles_tools_arm64"), allow_single_file = True)
_arm64_test_attrs["_test_tools"] = attr.label(default = Label("//internal/test_tools:tools_arm64"), providers = [TestToolsInfo])
_native_arm64_browser_test = rule(
    implementation = _remote_impl,
    attrs = _arm64_test_attrs,
    test = True,
    exec_groups = {"test": exec_group(exec_compatible_with = [str(Label("@platforms//os:linux")), str(Label("@platforms//cpu:arm64"))])},
)

def remote_browser_test(name, browser, env, args, tags, timeout, data, target_platform, visual, target_arch, worker_sha256 = None, host_vrt = False, execution = "actiond", cacheable = False, exec_properties = {}, shard_count = 0):
    """Run native browser tests and produce downloadable VRT captures."""
    if worker_sha256 != None and (len(worker_sha256) != 64 or any([c not in "0123456789abcdef" for c in worker_sha256.elems()])):
        fail("worker_sha256 must be a lowercase SHA256 digest")
    if worker_sha256 == None:
        worker_sha256 = WORKER_SHA256 if target_arch == "x64" else ""
    execution_properties = {} if host_vrt or execution == "local" else {"libc": "glibc2.39", "requires-bash": ""}
    if worker_sha256 and not host_vrt and execution != "local":
        execution_properties["actiond-worker-sha256"] = worker_sha256
    execution_properties.update(exec_properties)
    constraints = [Label("@platforms//os:linux"), Label("@platforms//cpu:" + ("x86_64" if target_arch == "x64" else "arm64"))]
    if not visual and target_arch == "arm64" and execution != "local":
        fail("ARM64 isolated execution currently supports VRT only; omit browser for host interaction tests")
    native_test = _native_arm64_browser_test if target_arch == "arm64" else _native_browser_test
    local_tools = Label("//internal/local:tools" + ("_arm64" if target_arch == "arm64" else "")) if execution == "local" else None
    native_test(
        name = name,
        inputs = ":" + name + "_inputs",
        browser = browser,
        env = env,
        args = args,
        mode = "test",
        data = data,
        target_platform = target_platform,
        target_arch = target_arch,
        host_vrt = host_vrt,
        execution = execution,
        local_tools = local_tools,
        cacheable = cacheable,
        exec_properties = execution_properties,
        exec_compatible_with = constraints,
        tags = ["visual_test" if visual else "browser_test"] + (["external", "no-cache"] if execution == "local" and not cacheable else []) + tags,
        timeout = timeout,
        shard_count = shard_count,
    )
    if not visual:
        return
    action = name + "_capture"
    capture_launcher = _remote_arm64 if target_arch == "arm64" else _remote
    capture_launcher(
        name = action + "_launcher",
        inputs = ":" + name + "_inputs",
        browser = browser,
        env = env,
        args = args,
        mode = "capture",
        data = data,
        target_platform = target_platform,
        target_arch = target_arch,
        host_vrt = host_vrt,
        execution = execution,
        local_tools = local_tools,
        cacheable = cacheable,
        exec_properties = execution_properties,
        tags = ["manual"],
    )
    _artifact(
        name = action,
        launcher = ":" + action + "_launcher",
        host_vrt = host_vrt,
        execution = execution,
        cacheable = cacheable,
        exec_compatible_with = constraints,
        exec_properties = execution_properties,
        tags = ["manual"],
    )
    prefix = native.package_name() + "/" if native.package_name() else ""
    source_update(name, action, "artifacts/reference", env["VRT_BASELINE_RELATIVE"].removeprefix(prefix), visual = True)
