"""Exercise runtime-only filtering through the public E2E macro."""

load("@bazel_skylib//lib:unittest.bzl", "analysistest", "asserts")
load("//e2e:defs.bzl", "web_e2e_test")

_SOURCE_FILES = ["source.ts", "source.tsx", "source.mts", "source.cts", "module.d.ts", "module.d.mts", "module.d.cts", "module.js.map", "module.tsbuildinfo"]
_RUNTIME_FILES = ["helper.mjs", "fixture.json", "fixture.map.json"]
_EXTERNAL_FILES = ["@runtime_input_files//:" + name for name in ["package.ts", "package.d.ts", "package.js.map"]]

def _fixture_impl(ctx):
    files = {}
    for name in [ctx.attr.module] + _SOURCE_FILES + _RUNTIME_FILES + ["data-only.json", "semantic-check.txt"]:
        file = ctx.outputs.source if name == "source.ts" else ctx.actions.declare_file(ctx.label.name + "/" + name)
        ctx.actions.write(file, "fixture\n")
        files[name] = file
    tree = ctx.actions.declare_directory(ctx.label.name + "/opaque.map")
    ctx.actions.run_shell(outputs = [tree], arguments = [tree.path], command = 'mkdir -p "$1"')
    return [
        DefaultInfo(
            files = depset([files[ctx.attr.module], files["source.ts"]]),
            default_runfiles = ctx.runfiles(
                files = [files[name] for name in _SOURCE_FILES + _RUNTIME_FILES] + [tree] + ctx.files.external,
                symlinks = {
                    ctx.label.name + "/runtime-alias": files[ctx.attr.module],
                    ctx.label.name + "/source-alias": files["source.ts"],
                },
                root_symlinks = {
                    ctx.label.name + "/root-runtime-alias": files[ctx.attr.module],
                    ctx.label.name + "/root-source-alias": files["source.ts"],
                },
            ),
            data_runfiles = ctx.runfiles(files = [files["data-only.json"]]),
        ),
        OutputGroupInfo(transitive_typecheck = depset([files["semantic-check.txt"]])),
    ]

_fixture = rule(
    implementation = _fixture_impl,
    attrs = {"module": attr.string(), "external": attr.label_list(allow_files = True)},
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
        expected = [module, "opaque.map"] + _RUNTIME_FILES
        if ctx.attr.runtime_only:
            expected.append("data-only.json")
            if ctx.attr.explicit_source and fixture == "runtime_specs":
                expected.append("source.ts")
        else:
            expected.extend(_SOURCE_FILES)
        asserts.equals(env, sorted(expected), actual)
        asserts.equals(env, module, aliases[fixture + "/runtime-alias"].basename)
        asserts.equals(env, module, root_aliases[fixture + "/root-runtime-alias"].basename)
        asserts.equals(env, not ctx.attr.runtime_only, fixture + "/source-alias" in aliases)
        asserts.equals(env, not ctx.attr.runtime_only, fixture + "/root-source-alias" in root_aliases)
    for file in ctx.files.external:
        asserts.true(env, file in files, "Dropped external package file: " + file.short_path)
    return analysistest.end(env)

_runtime_inputs_test = analysistest.make(
    _runtime_inputs_test_impl,
    attrs = {
        "runtime_only": attr.bool(),
        "explicit_source": attr.bool(),
        "external": attr.label_list(allow_files = True),
    },
)

def runtime_inputs_tests():
    for name, module in [("runtime_specs", "module.spec.js"), ("runtime_config", "module.js"), ("runtime_server", "module.js")]:
        _fixture(name = name, module = module, external = _EXTERNAL_FILES)
    for policy in ["default", "enabled", "explicit_data"]:
        name = "runtime_" + policy
        options = {} if policy == "default" else {"runtime_only": True}
        web_e2e_test(
            name = name,
            tests = ":runtime_specs",
            config = ":runtime_config",
            server = ":runtime_server",
            data = [":runtime_specs/source.ts"] if policy == "explicit_data" else [],
            **options
        )
        _runtime_inputs_test(
            name = name + "_test",
            target_under_test = ":" + name,
            runtime_only = policy != "default",
            explicit_source = policy == "explicit_data",
            external = _EXTERNAL_FILES,
        )
