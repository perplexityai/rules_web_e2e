"""VRT execution actions and local result consumers."""

load("@aspect_rules_js//js:defs.bzl", "js_binary", "js_test")
load("//playwright:defs.bzl", "BrowserRuntimeInfo", "runfile")

def _linux_impl(_settings, _attr):
    return {"//command_line_option:platforms": [str(Label("//internal:linux_amd64"))]}

_linux = transition(
    implementation = _linux_impl,
    inputs = [],
    outputs = ["//command_line_option:platforms"],
)

def _remote_impl(ctx):
    browser = ctx.attr.browser[0][BrowserRuntimeInfo]
    if browser.descriptor["arch"] != "x64":
        fail("Remote VRT currently requires a Linux amd64 runtime and worker")
    root = ctx.file.browser
    output = ctx.actions.declare_directory(ctx.label.name + ".results")
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
        "runfiles": manifest,
        "runner": ctx.file._runner.path,
        "env": env,
        "args": [ctx.expand_location(value, targets = locations) for value in ctx.attr.args],
        "output": output.path,
        "capture": ctx.attr.capture,
    }))
    descriptor = browser.descriptor
    ctx.actions.run(
        executable = "/workspace/" + root.path + "/" + descriptor["node"],
        arguments = [ctx.file._bootstrap.path, job.path],
        inputs = depset(files + [root, job, ctx.file._bootstrap]),
        outputs = [output],
        env = {
            "VRT_RUNTIME_ROOT": root.path,
            "HOME": "/tmp",
            "TMPDIR": "/tmp",
            "LANG": "C.UTF-8",
            "TZ": "UTC",
            "LD_LIBRARY_PATH": ":".join(["/workspace/" + root.path + "/" + p for p in descriptor["libraryDirs"]]),
        },
        execution_requirements = {"no-local": "1"},
        mnemonic = "VrtCapture" if ctx.attr.capture else "VrtCompare",
    )
    return [
        DefaultInfo(files = depset([output]), runfiles = ctx.runfiles(files = [output])),
        OutputGroupInfo(inputs = depset(files + [root, job, ctx.file._bootstrap])),
    ]

_remote = rule(
    implementation = _remote_impl,
    attrs = {
        "inputs": attr.label(mandatory = True, allow_single_file = True, cfg = _linux),
        "browser": attr.label(mandatory = True, providers = [BrowserRuntimeInfo], allow_single_file = True, cfg = _linux),
        "data": attr.label_list(allow_files = True, cfg = _linux),
        "env": attr.string_dict(),
        "args": attr.string_list(),
        "capture": attr.bool(),
        "_runtime": attr.label(default = Label("//runtime:files")),
        "_runner": attr.label(default = Label("//runtime:runner_entry"), allow_single_file = True),
        "_bootstrap": attr.label(default = Label("//runtime:remote_runner_entry"), allow_single_file = True),
        "_allowlist_function_transition": attr.label(default = "@bazel_tools//tools/allowlists/function_transition_allowlist"),
    },
)

def remote_browser_test(name, browser, env, args, tags, timeout, data):
    """Build comparisons/captures remotely, then consume their downloaded results."""
    for capture in [False, True]:
        action = name + ("_capture" if capture else "_compare")
        _remote(
            name = action,
            inputs = ":" + name + "_inputs",
            browser = browser,
            env = env,
            args = args,
            capture = capture,
            data = data,
            exec_properties = {"input-rootfs-env": "VRT_RUNTIME_ROOT"},
            exec_compatible_with = [Label("@platforms//os:linux"), Label("@platforms//cpu:x86_64")],
            tags = ["manual"],
        )
        common = dict(
            entry_point = Label("//runtime:remote_result_entry"),
            data = [":" + action, Label("//runtime:remote_result_files")],
            env = {
                "VRT_RESULT": "$(rlocationpath :%s)" % action,
                "VRT_APPLY_BASELINES": "1" if capture else "0",
                "VRT_BASELINE_RELATIVE": env["VRT_BASELINE_RELATIVE"],
            },
        )
        if capture:
            js_binary(name = name + ".update", tags = ["manual"], **common)
        else:
            js_test(name = name, tags = ["manual", "visual_test", "no-remote"] + tags, timeout = timeout, **common)
