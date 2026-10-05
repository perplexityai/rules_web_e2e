"""Declared host capture outputs and Bazel-managed source updates."""

load("@aspect_rules_js//js:defs.bzl", "js_binary")
load("@bazel_lib//lib:directory_path.bzl", "directory_path")
load("@bazel_lib//lib:write_source_files.bzl", "write_source_files")
load("@bazel_skylib//rules:common_settings.bzl", "BuildSettingInfo")

def _capture_impl(ctx):
    output = ctx.actions.declare_directory(ctx.label.name + ".results")
    selection = ctx.attr._filter[BuildSettingInfo].value
    ctx.actions.run(
        executable = ctx.attr.runner[DefaultInfo].files_to_run,
        arguments = ["--export-snapshots"] + ctx.attr.args + (["--grep", selection] if selection else []),
        outputs = [output],
        env = {
            "BAZEL_BINDIR": ctx.bin_dir.path,
            "VRT_SNAPSHOT_CAPTURE_OUTPUT": output.path,
            "VRT_SNAPSHOT_REFRESH": ctx.attr._refresh[BuildSettingInfo].value,
        },
        use_default_shell_env = True,
        execution_requirements = {"no-remote": "1", "no-sandbox": "1", "no-cache": "1"},
        mnemonic = "SnapshotCapture",
    )
    return [DefaultInfo(files = depset([output]), runfiles = ctx.runfiles(files = [output]))]

_capture = rule(
    implementation = _capture_impl,
    attrs = {
        "runner": attr.label(executable = True, cfg = "target"),
        "args": attr.string_list(),
        "_filter": attr.label(default = Label("//:snapshot_filter")),
        "_refresh": attr.label(default = Label("//:snapshot_refresh")),
    },
)

def snapshot_update(name, snapshot_dir, common, args, tags):
    js_binary(name = name + "_snapshot_runner", patch_node_fs = False, tags = ["manual"], **common)
    capture = name + "_snapshot_capture"
    _capture(name = capture, runner = ":" + name + "_snapshot_runner", args = args, tags = ["manual"])
    source_update(name, capture, "snapshots", snapshot_dir, tags = tags)

def source_update(name, capture, directory, destination, visual = False, tags = []):
    """Use one guarded bazel-lib writer for both VRT and native snapshots."""
    directory_path(name = name + "_snapshot_tree", directory = ":" + capture, path = directory, tags = ["manual"])
    writer = name + "_snapshot_write"
    write_source_files(
        name = writer,
        files = {destination: ":" + name + "_snapshot_tree"},
        diff_test = False,
        check_that_out_file_exists = False,
        tags = ["manual"],
        visibility = ["//visibility:private"],
    )
    relative = (native.package_name() + "/" if native.package_name() else "") + destination
    js_binary(
        name = name + ".update",
        entry_point = Label("//runtime:snapshot_result_entry"),
        data = [":" + capture, ":" + writer, Label("//runtime:remote_result_files")],
        env = {
            "VRT_RESULT": "$(rlocationpath :%s)" % capture,
            "VRT_SNAPSHOT_WRITER": "$(rlocationpath :%s)" % writer,
            "VRT_BASELINE_RELATIVE" if visual else "VRT_SNAPSHOT_RELATIVE": relative,
        },
        tags = ["manual"] + tags,
    )
