#!/usr/bin/env bash
set -euo pipefail
python3 -B .buildkite/artifacts_test.py
source .buildkite/setup.sh
install_node
bash e2e-tests/actiond/run-macos-arm64.sh "$RUNNER_TEMP/actiond-macos" --build-only
directory=".buildkite-artifacts/smoke/$USE_BAZEL_VERSION/darwin-arm64"
mkdir -p "$directory"
cp "$RUNNER_TEMP/actiond-macos/actiond-worker" "$directory/actiond-worker"
python3 .buildkite/artifacts.py pack "$directory" darwin-arm64
buildkite-agent artifact upload "$directory/*"

work="$RUNNER_TEMP/actiond-macos"
(
  cd "$work/actiond"
  flags=(--bes_backend= --remote_executor= --remote_cache= --spawn_strategy=local --jobs=2)
  target=//cmd/windows-actiond:windows-actiond_windows_x86_64
  bazelisk --output_base="$work/worker-output" build "${flags[@]}" "$target"
  worker=$(bazelisk --output_base="$work/worker-output" cquery "${flags[@]}" "$target" --output=starlark '--starlark:expr=providers(target)["DefaultInfo"].files_to_run.executable.path')
  cp -L "$worker" "$work/actiond-worker.exe"
)
directory=".buildkite-artifacts/smoke/$USE_BAZEL_VERSION/windows-amd64"
mkdir -p "$directory"
cp "$work/actiond-worker.exe" "$directory/actiond-worker.exe"
python3 .buildkite/artifacts.py pack "$directory" windows-amd64
buildkite-agent artifact upload "$directory/*"
