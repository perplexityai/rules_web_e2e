"""Exercise runtime-only filtering through the public E2E macro."""

load("@bazel_skylib//lib:unittest.bzl", "analysistest", "asserts")
load("//component:defs.bzl", "browser_shell")
load("//e2e:defs.bzl", "web_e2e_test")

_SOURCE_FILES = ["source.ts", "source.tsx", "source.mts", "source.cts", "module.d.ts", "module.d.mts", "module.d.cts", "module.js.map", "module.tsbuildinfo"]
_RUNTIME_FILES = ["helper.mjs", "fixture.json", "fixture.map.json"]
_EXTERNAL_FILES = ["@runtime_input_files//:" + name for name in ["package.ts", "package.d.ts", "package.js.map", "package"]]

def _fixture_impl(ctx):
    files = {}
    for name in [ctx.attr.module] + _SOURCE_FILES + _RUNTIME_FILES + ["data-only.json", "semantic-check.txt"]:
        file = ctx.outputs.source if name == "source.ts" else ctx.actions.declare_file(ctx.label.name + "/" + name)
        ctx.actions.write(file, "fixture\n")
        files[name] = file
    tree = ctx.actions.declare_directory(ctx.label.name + "/opaque.map")
    ctx.actions.run_shell(outputs = [tree], arguments = [tree.path], command = '''
mkdir -p "$1/nested"
printf 'runtime asset' > "$1/nested/asset.js"
printf 'runtime fixture' > "$1/fixture.map.json"
printf 'debug metadata' > "$1/asset.js.map"
printf 'debug metadata' > "$1/nested/asset.js.map"
''')
    return [
        DefaultInfo(
            files = depset([files[ctx.attr.module], files["source.ts"]]),
            default_runfiles = ctx.runfiles(
                files = [files[name] for name in _SOURCE_FILES + _RUNTIME_FILES] + [tree] + ctx.files.external,
                symlinks = {
                    ctx.label.name + "/runtime-alias": files[ctx.attr.module],
                    ctx.label.name + "/source-alias": files["source.ts"],
                    ctx.label.name + "/directory-alias": tree,
                },
                root_symlinks = {
                    ctx.label.name + "/root-runtime-alias": files[ctx.attr.module],
                    ctx.label.name + "/root-source-alias": files["source.ts"],
                    ctx.label.name + "/root-directory-alias": tree,
                },
            ).merge(ctx.attr._playwright[DefaultInfo].default_runfiles).merge(ctx.attr._npm[DefaultInfo].default_runfiles),
            data_runfiles = ctx.runfiles(files = [files["data-only.json"]]),
        ),
        OutputGroupInfo(transitive_typecheck = depset([files["semantic-check.txt"]]), assets = depset([tree])),
    ]

_fixture = rule(
    implementation = _fixture_impl,
    attrs = {
        "module": attr.string(),
        "external": attr.label_list(allow_files = True),
        "_playwright": attr.label(default = "//runtime:playwright"),
        "_npm": attr.label(default = "//:node_modules/typescript"),
    },
    outputs = {"source": "%{name}/source.ts"},
)

def _runtime_inputs_test_impl(ctx):
    env = analysistest.begin(ctx)
    runfiles = analysistest.target_under_test(env)[DefaultInfo].default_runfiles
    files = runfiles.files.to_list()
    aliases = {entry.path: entry.target_file for entry in runfiles.symlinks.to_list()}
    root_aliases = {entry.path: entry.target_file for entry in runfiles.root_symlinks.to_list()}
    for fixture, module in [("runtime_specs", "module.spec.js"), ("runtime_config", "module.js"), ("runtime_server", "module.js")]:
        prefix = ctx.label.package + "/" + fixture + "/"
        actual = sorted([file.basename for file in files if file.short_path.startswith(prefix)])
        expected = [module, "data-only.json"] + _RUNTIME_FILES
        asserts.true(env, prefix + "opaque.map" in aliases)
        asserts.true(env, aliases[prefix + "opaque.map"] in files, "Projected aliases need a canonical file for isolated runtime staging")
        if ctx.attr.explicit_source and fixture == "runtime_specs":
            expected.append("source.ts")
        asserts.equals(env, sorted(expected), actual)
        asserts.equals(env, module, aliases[fixture + "/runtime-alias"].basename)
        asserts.equals(env, module, root_aliases[fixture + "/root-runtime-alias"].basename)
        asserts.false(env, fixture + "/source-alias" in aliases)
        asserts.false(env, fixture + "/root-source-alias" in root_aliases)
    for file in ctx.files.external:
        asserts.true(env, file in files, "Dropped external package file: " + file.short_path)
    for file in ctx.attr._playwright[DefaultInfo].default_runfiles.files.to_list():
        if file.is_directory:
            asserts.true(env, file in files, "Runtime package must remain unfiltered: " + file.short_path)
            asserts.equals(env, file, aliases.get(file.short_path, file))
    for file in ctx.attr._npm[DefaultInfo].default_runfiles.files.to_list():
        if file.is_directory:
            asserts.true(env, file in files, "Node resolves compiled modules against original npm package trees: " + file.short_path)
            asserts.equals(env, file, aliases.get(file.short_path, file))
    return analysistest.end(env)

_runtime_inputs_test = analysistest.make(
    _runtime_inputs_test_impl,
    attrs = {
        "explicit_source": attr.bool(),
        "external": attr.label_list(allow_files = True),
        "_playwright": attr.label(default = "//runtime:playwright"),
        "_npm": attr.label(default = "//:node_modules/typescript"),
    },
)

def _directory_contents_test_impl(ctx):
    lines = ["#!/usr/bin/env bash", "set -euo pipefail", 'cd "$TEST_SRCDIR"']
    for fixture in (["runtime_server"] if ctx.attr.shell else ["runtime_specs", "runtime_config", "runtime_server"]):
        directories = [ctx.workspace_name + "/tests/" + fixture + "/opaque.map"]
        if not ctx.attr.shell:
            directories.extend([
                ctx.workspace_name + "/" + fixture + "/directory-alias",
                fixture + "/root-directory-alias",
            ])
        for directory in directories:
            lines.extend([
                "test \"$(cat '%s/nested/asset.js')\" = 'runtime asset'" % directory,
                "test -f '%s/fixture.map.json'" % directory,
                "test %s '%s/asset.js.map'" % ("-f" if ctx.attr.keep_maps else "! -e", directory),
                "test %s '%s/nested/asset.js.map'" % ("-f" if ctx.attr.keep_maps else "! -e", directory),
            ])
    ctx.actions.write(ctx.outputs.executable, "\n".join(lines) + "\n", is_executable = True)
    return [DefaultInfo(executable = ctx.outputs.executable, runfiles = ctx.attr.inputs[DefaultInfo].default_runfiles)]

_directory_contents_test = rule(
    implementation = _directory_contents_test_impl,
    test = True,
    attrs = {"inputs": attr.label(), "keep_maps": attr.bool(), "shell": attr.bool()},
)

def runtime_inputs_tests():
    for name, module in [("runtime_specs", "module.spec.js"), ("runtime_config", "module.js"), ("runtime_server", "module.js")]:
        _fixture(name = name, module = module, external = _EXTERNAL_FILES)
        native.filegroup(name = name + "_assets", srcs = [":" + name], output_group = "assets")
    for policy in ["default", "explicit_data"]:
        name = "runtime_" + policy
        web_e2e_test(
            name = name,
            tests = ":runtime_specs",
            config = ":runtime_config",
            server = ":runtime_server",
            tags = ["manual"],
            data = [":runtime_specs/source.ts"] if policy == "explicit_data" else [],
        )
        _runtime_inputs_test(
            name = name + "_test",
            target_under_test = ":" + name,
            explicit_source = policy == "explicit_data",
            external = _EXTERNAL_FILES,
        )
        _directory_contents_test(
            name = name + "_directories_test",
            inputs = ":" + name + "_inputs",
        )
    web_e2e_test(
        name = "runtime_explicit_directories",
        tags = ["manual"],
        tests = ":runtime_specs",
        config = ":runtime_config",
        server = ":runtime_server",
        data = [":" + name + "_assets" for name in ["runtime_specs", "runtime_config", "runtime_server"]],
    )
    _directory_contents_test(
        name = "runtime_explicit_directories_test",
        inputs = ":runtime_explicit_directories_inputs",
        keep_maps = True,
    )
    browser_shell(name = "runtime_directory_shell", assets = ":runtime_server_assets")
    web_e2e_test(name = "runtime_shell", tests = ":runtime_specs", shell = ":runtime_directory_shell", tags = ["manual"])
    _directory_contents_test(name = "runtime_shell_test", inputs = ":runtime_shell_inputs", shell = True)
