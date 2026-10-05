"""Shared compilation settings for repository tools."""

load("@aspect_rules_ts//ts:defs.bzl", "ts_project")

def tool_sources(deps = []):
    ts_project(
        name = "typecheck",
        srcs = native.glob(["*.ts"]),
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
