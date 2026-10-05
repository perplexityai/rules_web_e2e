"""Shared compilation settings for repository tools."""

load("@aspect_rules_ts//ts:defs.bzl", "ts_project")

def tool_sources(deps = []):
    sources = native.glob(["*.ts"], exclude = ["*_test.ts"], allow_empty = True)
    tests = native.glob(["*_test.ts"], allow_empty = True)
    for name, srcs in [("typecheck", sources), ("test_typecheck", tests)]:
        if not srcs:
            continue
        _sources(name, srcs, deps + ([":typecheck"] if name == "test_typecheck" and sources else []))

def _sources(name, srcs, deps):
    ts_project(
        name = name,
        testonly = name == "test_typecheck",
        srcs = srcs,
        declaration = True,
        data = ["package.json"],
        transpiler = "tsc",
        tsc = Label("@npm_typescript//:tsc"),
        tsc_worker = Label("@npm_typescript//:tsc_worker"),
        validator = Label("@npm_typescript//:validator"),
        tsconfig = {"compilerOptions": {
            "target": "ES2022",
            "module": "ESNext",
            "moduleResolution": "Bundler",
            "strict": True,
            "skipLibCheck": True,
            "types": ["node"],
        }},
        deps = [Label("//:node_modules/@types/node")] + deps,
        visibility = ["//visibility:public"],
    )
