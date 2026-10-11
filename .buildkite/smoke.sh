#!/usr/bin/env bash
set -euo pipefail
[[ $(uname -s)-$(uname -m) == Darwin-arm64 ]] || exit 1
: "${SMOKE_PRODUCER_STEP:?}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
artifact=".buildkite-artifacts/smoke/${USE_BAZEL_VERSION:?}/darwin-arm64"
buildkite-agent artifact download "$artifact/*" "$work" \
  --build "${BUILDKITE_BUILD_ID:?}" --step "$SMOKE_PRODUCER_STEP"
directory="$work/$artifact"
python3 .buildkite/artifacts.py verify "$directory" darwin-arm64
codesign --verify --strict "$directory/actiond-worker"
codesign -d --entitlements - "$directory/actiond-worker" 2> "$work/signature.txt" > "$work/entitlements.plist"
grep -q 'com.apple.security.virtualization' "$work/entitlements.plist"
"$directory/actiond-worker" --help > "$work/help.txt"
grep -q 'serve-vm' "$work/help.txt"
