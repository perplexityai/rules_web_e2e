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
