"""Native browser tests and VRT artifact-producing actions."""

load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_test")
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

def _native_test(ctx, root, descriptor, files, job):
    executable = ctx.actions.declare_file(ctx.label.name)
    setup = ctx.actions.declare_file(ctx.label.name + ".bash-env")
    tools = ctx.attr._test_tools[TestToolsInfo]

    # Bazel itself invokes /bin/bash before our executable. actiond supplies
    # its pinned static shell; BASH_ENV supplies the wrapper's declared tools.
    ctx.actions.write(setup, "\n".join([
        "unset BASH_ENV",
        'if [[ -e /bin/sh || -e /lib64/ld-linux-x86-64.so.2 ]]; then echo "Browser tests require isolated actiond execution" >&2; exit 1; fi',
        'case "$TEST_SRCDIR" in /*) ;; *) export TEST_SRCDIR="$PWD/$TEST_SRCDIR" ;; esac',
        'export MAGIC="$TEST_SRCDIR/%s"' % runfile(tools.magic),
    ] + [
        '%s() { "$TEST_SRCDIR/%s" %s "$@"; }; export -f %s' % (command, runfile(binary), " ".join(args), command)
        for command, (binary, args) in tools.commands.items()
    ]) + "\n")
    ctx.actions.write(executable, "\n".join([
        "#!/bin/bash",
        "set -euo pipefail",
        'root="$TEST_SRCDIR/%s"' % runfile(root),
        'exec "$root/%s" --library-path "%s" "$root/%s" "$TEST_SRCDIR/%s" "$TEST_SRCDIR/%s" "$@"' % (
            descriptor["loader"],
            ":".join(["$root/" + p for p in descriptor["libraryDirs"]]),
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
        }),
        testing.ExecutionInfo({"no-local": "1"}),
    ]

def _remote_impl(ctx):
    native_test = ctx.attr.mode == "test"
    browser = ctx.attr.browser[0][BrowserRuntimeInfo]
    if browser.descriptor["arch"] != ctx.attr.target_arch:
        fail("browser runtime arch must match target_arch (" + ctx.attr.target_arch + ")")
    if ctx.attr._platform[0][LinuxPlatformInfo].arch != ctx.attr.target_arch:
        fail("target_platform CPU must match target_arch")
    root = ctx.file.browser
    output = None if native_test else ctx.actions.declare_directory(ctx.label.name + ".results")
    files = []
    manifest = {}
    for target in [ctx.attr.inputs[0], ctx.attr._runtime, ctx.attr._runner]:
        info = target[DefaultInfo]
        runfiles = info.default_runfiles
        for file in depset(transitive = [info.files, runfiles.files]).to_list():
            files.append(file)
            manifest[runfile(file)] = file.path
        for link in runfiles.symlinks.to_list():
            files.append(link.target_file)
            manifest["_main/" + link.path] = link.target_file.path
        for link in runfiles.root_symlinks.to_list():
            files.append(link.target_file)
            manifest[link.path] = link.target_file.path
    locations = ctx.attr.data + ctx.attr.inputs
    env = {key: ctx.expand_location(value, targets = locations) for key, value in ctx.attr.env.items() if key != "VRT_DESCRIPTOR"}
    env["VRT_DESCRIPTOR"] = runfile(ctx.file.inputs)
    job = ctx.actions.declare_file(ctx.label.name + ".job.json")
    ctx.actions.write(job, json.encode({
        "runfiles": {key: key for key in manifest} if native_test else manifest,
        "runner": runfile(ctx.file._runner) if native_test else ctx.file._runner.path,
        "env": env,
        "args": [] if native_test else [ctx.expand_location(value, targets = locations) for value in ctx.attr.args],
        "output": "" if native_test else output.path,
        "mode": ctx.attr.mode,
        "runtime": dict(browser.descriptor, path = runfile(root) if native_test else root.path),
    }))
    descriptor = browser.descriptor
    if native_test:
        return _native_test(ctx, root, descriptor, files, job)
    ctx.actions.run(
        executable = root.path + "/" + descriptor["loader"],
        arguments = [
            "--library-path",
            ":".join([root.path + "/" + p for p in descriptor["libraryDirs"]]),
            root.path + "/" + descriptor["node"],
            ctx.file._bootstrap.path,
            job.path,
        ],
        inputs = depset(files + [root, job, ctx.file._bootstrap]),
        outputs = [output],
        env = {
            "HOME": "/tmp",
            "TMPDIR": "/tmp",
            "LANG": "C.UTF-8",
            "TZ": "UTC",
        },
        execution_requirements = {"no-local": "1"},
        mnemonic = {"capture": "VrtCapture", "compare": "VrtCompare", "test": "BrowserTest"}[ctx.attr.mode],
    )
    return [
        DefaultInfo(files = depset([output]), runfiles = ctx.runfiles(files = [output])),
        OutputGroupInfo(inputs = depset(files + [root, job, ctx.file._bootstrap])),
    ]

_attrs = {
    "inputs": attr.label(mandatory = True, allow_single_file = True, cfg = _linux),
    "browser": attr.label(mandatory = True, providers = [BrowserRuntimeInfo], allow_single_file = True, cfg = _linux),
    "data": attr.label_list(allow_files = True, cfg = _linux),
    "target_platform": attr.label(mandatory = True),
    "_platform": attr.label(default = Label("//internal:target_platform"), cfg = _linux),
    "target_arch": attr.string(mandatory = True, values = ["x64", "arm64"]),
    "env": attr.string_dict(),
    "args": attr.string_list(),
    "mode": attr.string(mandatory = True, values = ["capture", "compare", "test"]),
    "_runtime": attr.label(default = Label("//runtime:files")),
    "_runner": attr.label(default = Label("//runtime:runner_entry"), allow_single_file = True),
    "_bootstrap": attr.label(default = Label("//runtime:remote_runner_entry"), allow_single_file = True),
    "_allowlist_function_transition": attr.label(default = "@bazel_tools//tools/allowlists/function_transition_allowlist"),
}
_remote = rule(implementation = _remote_impl, attrs = _attrs)

_test_attrs = dict(_attrs)
_test_attrs.pop("args")  # Native test rules already have this attribute.
_test_attrs["_test_tools"] = attr.label(default = Label("//internal/test_tools:tools"), providers = [TestToolsInfo])
_native_browser_test = rule(
    implementation = _remote_impl,
    attrs = _test_attrs,
    test = True,
    exec_groups = {"test": exec_group(exec_compatible_with = [str(Label("@platforms//os:linux")), str(Label("@platforms//cpu:x86_64"))])},
)

def remote_browser_test(name, browser, env, args, tags, timeout, data, target_platform, visual, target_arch):
    """Run native browser tests or produce downloadable VRT comparisons/captures."""
    constraints = [Label("@platforms//os:linux"), Label("@platforms//cpu:" + ("x86_64" if target_arch == "x64" else "arm64"))]
    if not visual and target_arch == "arm64":
        fail("ARM64 isolated execution currently supports VRT only; omit browser for host interaction tests")
    if not visual:
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
            exec_properties = {"requires-bash": ""},
            exec_compatible_with = constraints,
            tags = ["manual", "browser_test"] + tags,
            timeout = timeout,
        )
        return
    for mode in ["compare", "capture"]:
        capture = mode == "capture"
        action = name + "_" + mode
        _remote(
            name = action,
            inputs = ":" + name + "_inputs",
            browser = browser,
            env = env,
            args = args,
            mode = mode,
            data = data,
            target_platform = target_platform,
            target_arch = target_arch,
            exec_compatible_with = constraints,
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
