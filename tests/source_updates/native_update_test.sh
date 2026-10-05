#!/usr/bin/env bash
set -euo pipefail
updater="$PWD/$1"
workspace="$TEST_TMPDIR/workspace"
destination="$workspace/tests/source_updates/native/default/native.spec.js-snapshots"
mkdir -p "$destination"
cp "$2" "$destination/keep.txt"
cp "$3" "$destination/change.txt"
BUILD_WORKSPACE_DIRECTORY="$workspace" "$updater"
[[ $(cat "$destination/keep.txt") == keep ]]
[[ $(cat "$destination/change.txt") == new ]]
