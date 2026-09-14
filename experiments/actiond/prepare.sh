#!/usr/bin/env bash
# Linux amd64 prototype setup. Image acquisition occurs only here.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=${1:?usage: prepare.sh ABSOLUTE_WORK_DIRECTORY}
[[ $work = /* ]] || { echo 'Use an absolute work directory' >&2; exit 1; }
mkdir -p "$work"/{build,workspace}
actiond_commit=8a42c3d481df3a1bf1b80e95a9bb991a207fc035
zig_sha=70e49664a74374b48b51e6f3fdfbf437f6395d42509050588bd49abe52ba3d00
if [[ ! -d $work/actiond/.git ]]; then
  git clone https://github.com/hermeticbuild/actiond.git "$work/actiond"
fi
git -C "$work/actiond" checkout --detach "$actiond_commit"
if [[ ! -f $work/zig.tar.xz ]]; then
  curl -fsSL https://ziglang.org/download/0.16.0/zig-x86_64-linux-0.16.0.tar.xz -o "$work/zig.tar.xz"
fi
printf '%s  %s\n' "$zig_sha" "$work/zig.tar.xz" | sha256sum -c -
if [[ ! -d $work/zig-x86_64-linux-0.16.0 ]]; then tar -xf "$work/zig.tar.xz" -C "$work"; fi
for file in action_runner cas reapi protobuf_wire; do cp "$work/actiond/src/$file.zig" "$work/build/"; done
cp "$here/sandbox-smoke.zig" "$work/build/"
printf 'pub const executor_timing_logs = false;\npub const actiondfs_fstype: [:0]const u8 = "actiondfs";\n' > "$work/build/options.zig"
ZIG_GLOBAL_CACHE_DIR="$work/zig-cache" "$work/zig-x86_64-linux-0.16.0/zig" build-exe -O ReleaseFast -target x86_64-linux-musl \
  --dep actiond_build_options -Mroot="$work/build/sandbox-smoke.zig" \
  -Mactiond_build_options="$work/build/options.zig" -femit-bin="$work/build/sandbox-smoke"
runtime_image=mcr.microsoft.com/playwright:v1.63.0-noble@sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7
runtime_key=$({ printf '%s\n' "$runtime_image"; cat "$here/package-runtime.sh"; } | sha256sum | cut -d ' ' -f 1)
if [[ ! -f $work/runtime.tar || $(cat "$work/runtime.key" 2>/dev/null || true) != "$runtime_key" ]]; then
  docker run --rm -i --network none --pull=never \
    "$runtime_image" \
    bash -s /output < "$here/package-runtime.sh" > "$work/runtime.tar.tmp"
  mv "$work/runtime.tar.tmp" "$work/runtime.tar"
  printf '%s\n' "$runtime_key" > "$work/runtime.key"
fi
mkdir -p "$work/workspace/runtime"
tar -xf "$work/runtime.tar" -C "$work/workspace/runtime"
cp "$work/workspace/runtime/lib/ld-linux-x86-64.so.2" "$work/workspace/ld.so"
python3 "$here/patch-interpreter.py" "$work/workspace/runtime/bin/node" "$work/workspace/runtime/chromium/chrome-headless-shell"
cp -RL "$here/../../node_modules/playwright-core" "$work/workspace/"
ZIG_GLOBAL_CACHE_DIR="$work/zig-cache" "$work/zig-x86_64-linux-0.16.0/zig" cc -target x86_64-linux-musl -O2 "$here/kernel-probe.c" -o "$work/workspace/kernel-probe"
cp "$here/capture.mjs" "$here/capture.bzl" "$work/workspace/"
cp "$here/BUILD.bazel.template" "$work/workspace/BUILD.bazel"
printf 'module(name = "actiond_chromium_prototype")\nbazel_dep(name = "platforms", version = "1.1.0")\n' > "$work/workspace/MODULE.bazel"
printf 'Prepared %s\n' "$work"
