#!/usr/bin/env bash
# Prepare declared inputs for the Linux VM integration suite.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repository=$(cd "$here/../.." && pwd)
work=${1:?usage: prepare.sh ABSOLUTE_WORK_DIRECTORY}
[[ $work = /* ]] || { echo 'Use an absolute work directory' >&2; exit 1; }
bazel_bin=${ACTIOND_BAZEL:-bazelisk}
arch=${ACTIOND_ARCH:-x64}
case "$arch" in x64) runtime_target=browser; runtime_example=preset ;; arm64) runtime_target=browser_arm64; runtime_example=browser-runtime ;; *) echo 'ACTIOND_ARCH must be x64 or arm64' >&2; exit 1 ;; esac
mkdir -p "$work/actiond"
if [[ ${ACTIOND_SKIP_WORKER_SOURCE:-0} != 1 ]]; then
  (
    cd "$repository"
    "$bazel_bin" build //tests/actiond:worker_source
    archive=$("$bazel_bin" cquery //tests/actiond:worker_source --output=files)
    execution_root=$("$bazel_bin" info execution_root)
    tar -xf "$execution_root/$archive" --strip-components=1 -C "$work/actiond"
  )
fi
(
  cd "$repository/examples/$runtime_example"
  "$bazel_bin" build "//:$runtime_target"
  runtime=$("$bazel_bin" cquery "//:$runtime_target" --output=files)
  tar -C "$runtime" -cf "$work/runtime.tar" .
)
