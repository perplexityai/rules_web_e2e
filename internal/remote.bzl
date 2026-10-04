"""Native browser tests and VRT artifact-producing actions."""

load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_test")
load("@web_e2e_worker_identity//:defs.bzl", "WORKER_SHA256")
load("//internal/test_tools:defs.bzl", "TestToolsInfo")
load("//playwright:defs.bzl", "BrowserRuntimeInfo", "runfile")

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
    "/lib/x86_64-linux-gnu", "/lib/aarch64-linux-gnu", "/lib64", "/lib",
    "/usr/lib/x86_64-linux-gnu", "/usr/lib/aarch64-linux-gnu", "/usr/lib",
])

def _library_path(root, descriptor):
    return _WORKER_LIBRARIES + ":" + ":".join([root + "/" + p for p in descriptor["libraryDirs"]])

def _native_test(ctx, root, descriptor, files, job):
    executable = ctx.actions.declare_file(ctx.label.name)
    setup = ctx.actions.declare_file(ctx.label.name + ".bash-env")
    tools = ctx.attr._test_tools[TestToolsInfo]

    # Bazel itself invokes /bin/bash before our executable. actiond supplies
    # its pinned static shell; BASH_ENV supplies the wrapper's declared tools.
    ctx.actions.write(setup, "\n".join([
        "unset BASH_ENV",
        'case "$TEST_SRCDIR" in /*) ;; *) export TEST_SRCDIR="$PWD/$TEST_SRCDIR" ;; esac',
        'source "$TEST_SRCDIR/%s"' % runfile(tools.shell_setup),
    ]) + "\n")
    ctx.actions.write(executable, "\n".join([
        "#!/bin/bash",
        "set -euo pipefail",
        'root="$TEST_SRCDIR/%s"' % runfile(root),
        'export LD_LIBRARY_PATH="%s"' % _library_path("$root", descriptor),
        'exec "$root/%s" "$TEST_SRCDIR/%s" "$TEST_SRCDIR/%s" "$@"' % (
            descriptor["node"],
            runfile(ctx.file._bootstrap),
            runfile(job),
        ),
    ]) + "\n", is_executable = True)
    inputs = files + [root, job, ctx.file._bootstrap, setup] + ctx.attr._test_tools[DefaultInfo].files.to_list()
    return [
        DefaultInfo(executable = executable, runfiles = ctx.runfiles(files = inputs).merge_all([
            target[DefaultInfo].default_runfiles
            for target in [ctx.attr.inputs[0], ctx.attr._runtime, ctx.attr._runner]
        ])),
        testing.TestEnvironment({
            "BASH_ENV": executable.path + ".runfiles/" + runfile(setup),
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
    files = []
    runfiles = ctx.runfiles(files = [root, ctx.file._bootstrap])
    for target in [ctx.attr.inputs[0], ctx.attr._runtime, ctx.attr._runner]:
        info = target[DefaultInfo]
        files.extend(info.files.to_list())
        runfiles = runfiles.merge(info.default_runfiles).merge(ctx.runfiles(transitive_files = info.files))
    locations = ctx.attr.data + ctx.attr.inputs
    env = {key: ctx.expand_location(value, targets = locations) for key, value in ctx.attr.env.items() if key != "VRT_DESCRIPTOR"}
    env["VRT_DESCRIPTOR"] = runfile(ctx.file.inputs)
    job = ctx.actions.declare_file(ctx.label.name + ".job.json")
    ctx.actions.write(job, json.encode({
        "runner": runfile(ctx.file._runner),
        "env": env,
        "args": [] if native_test else [ctx.expand_location(value, targets = locations) for value in ctx.attr.args],
        "output": "",
        "mode": ctx.attr.mode,
        "runtime": dict(browser.descriptor, path = runfile(root)),
    }))
    descriptor = browser.descriptor
    if native_test:
        return _native_test(ctx, root, descriptor, files, job)
    executable = ctx.actions.declare_file(ctx.label.name)
    ctx.actions.write(executable, "\n".join([
        "#!/bin/bash",
        "set -euo pipefail",
        # FilesToRunProvider asks Bazel to supply this executable's runfiles tree.
        'export RUNFILES_DIR="$0.runfiles"',
        'case "$RUNFILES_DIR" in /*) ;; *) RUNFILES_DIR="$PWD/$RUNFILES_DIR" ;; esac',
        'root="$RUNFILES_DIR/%s"' % runfile(root),
        'export LD_LIBRARY_PATH="%s"' % _library_path("$root", descriptor),
        'exec "$root/%s" "$RUNFILES_DIR/%s" "$RUNFILES_DIR/%s" "$@"' % (
            descriptor["node"],
            runfile(ctx.file._bootstrap),
            runfile(job),
        ),
    ]) + "\n", is_executable = True)
    return [DefaultInfo(executable = executable, runfiles = runfiles.merge(ctx.runfiles(files = [job])))]

def _artifact_impl(ctx):
    output = ctx.actions.declare_directory(ctx.label.name + ".results")
    launcher = ctx.attr.launcher[DefaultInfo]
    ctx.actions.run(
        executable = launcher.files_to_run,
        arguments = [output.path],
        outputs = [output],
        env = {
            "HOME": "/tmp",
            "TMPDIR": "/tmp",
            "LANG": "C.UTF-8",
            "TZ": "UTC",
            "VRT_HOST_EXECUTION": "1" if ctx.attr.host_vrt else "0",
        },
        execution_requirements = {"no-remote": "1", "no-cache": "1"} if ctx.attr.host_vrt else {"no-local": "1"},
        mnemonic = "VrtCapture" if ctx.attr.mode == "capture" else "VrtCompare",
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
        "mode": attr.string(values = ["capture", "compare"]),
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
    "mode": attr.string(mandatory = True, values = ["capture", "compare", "test"]),
    "host_vrt": attr.bool(default = False),
    "_runtime": attr.label(default = Label("//runtime:files")),
    "_runner": attr.label(default = Label("//runtime:runner_entry"), allow_single_file = True),
    "_bootstrap": attr.label(default = Label("//runtime:remote_runner_entry"), allow_single_file = True),
    "_allowlist_function_transition": attr.label(default = "@bazel_tools//tools/allowlists/function_transition_allowlist"),
}
_remote = rule(implementation = _remote_impl, attrs = _attrs, executable = True)

_test_attrs = dict(_attrs)
_test_attrs["_test_tools"] = attr.label(default = Label("//internal/test_tools:tools"), providers = [TestToolsInfo])
_native_browser_test = rule(
    implementation = _remote_impl,
    attrs = _test_attrs,
    test = True,
    exec_groups = {"test": exec_group(exec_compatible_with = [str(Label("@platforms//os:linux")), str(Label("@platforms//cpu:x86_64"))])},
)

def remote_browser_test(name, browser, env, args, tags, timeout, data, target_platform, visual, target_arch, worker_sha256 = None, host_vrt = False):
    """Run native browser tests or produce downloadable VRT comparisons/captures."""
    if worker_sha256 != None and (len(worker_sha256) != 64 or any([c not in "0123456789abcdef" for c in worker_sha256.elems()])):
        fail("worker_sha256 must be a lowercase SHA256 digest")
    if worker_sha256 == None:
        worker_sha256 = WORKER_SHA256 if target_arch == "x64" else ""
    execution_properties = {} if host_vrt else {"libc": "glibc2.39", "requires-bash": ""}
    if worker_sha256 and not host_vrt:
        execution_properties["actiond-worker-sha256"] = worker_sha256
    constraints = [Label("@platforms//os:linux"), Label("@platforms//cpu:" + ("x86_64" if target_arch == "x64" else "arm64"))]
    if not visual and target_arch == "arm64":
        fail("ARM64 isolated execution currently supports VRT only; omit browser for host interaction tests")
    # Native launcher tools currently target amd64. Keep ARM64's existing
    # artifact comparison until those tools support its execution platform.
    native_comparison = not visual or target_arch == "x64"
    if native_comparison:
        _native_browser_test(
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
            exec_properties = execution_properties,
            exec_compatible_with = constraints,
            tags = ["manual", "visual_test" if visual else "browser_test"] + tags,
            timeout = timeout,
        )
    if not visual:
        return
    for mode in (["capture"] if native_comparison else ["compare", "capture"]):
        capture = mode == "capture"
        action = name + "_" + mode
        _remote(
            name = action + "_launcher",
            inputs = ":" + name + "_inputs",
            browser = browser,
            env = env,
            args = args,
            mode = mode,
            data = data,
            target_platform = target_platform,
            target_arch = target_arch,
            host_vrt = host_vrt,
            exec_compatible_with = constraints,
            exec_properties = execution_properties,
            tags = ["manual"],
        )
        _artifact(
            name = action,
            launcher = ":" + action + "_launcher",
            mode = mode,
            host_vrt = host_vrt,
            exec_compatible_with = constraints,
            exec_properties = execution_properties,
            tags = ["manual"],
        )
        common = dict(
            entry_point = Label("//runtime:remote_result_entry"),
            data = [":" + action, Label("//runtime:remote_result_files")],
            env = {
                "VRT_RESULT": "$(rlocationpath :%s)" % action,
                "VRT_RESULT_MODE": mode,
                "VRT_APPLY_BASELINES": "1" if capture else "0",
                "VRT_BASELINE_RELATIVE": env["VRT_BASELINE_RELATIVE"],
            },
        )
        if capture:
            js_binary(name = name + ".update", tags = ["manual"], **common)
        else:
            js_test(name = name, tags = ["manual", "visual_test", "no-remote"] + tags, timeout = timeout, **common)
