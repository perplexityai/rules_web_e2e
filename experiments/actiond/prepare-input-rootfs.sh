#!/usr/bin/env bash
# Restore original ELF interpreters and expose the minimal image runtime layout.
set -euo pipefail
work=${1:?usage: prepare-input-rootfs.sh ABSOLUTE_WORK_DIRECTORY}
[[ $work = /* ]] || exit 1
tar -xf "$work/runtime.tar" -C "$work/workspace/runtime"
mkdir -p "$work/workspace/runtime/lib64"
cp "$work/workspace/runtime/lib/ld-linux-x86-64.so.2" "$work/workspace/runtime/lib64/"
ln -sf bash "$work/workspace/runtime/bin/sh"
