#!/usr/bin/env bash
set -euo pipefail
updater="$PWD/$1"
workspace="$TEST_TMPDIR/workspace"
destination="$workspace/tests/source_updates/baselines"
mkdir -p "$destination"
printf old > "$destination/old.png"
printf keep > "$destination/README.md"
if BUILD_WORKSPACE_DIRECTORY="$workspace" "$updater" > "$TEST_TMPDIR/rejected.log" 2>&1; then
  echo 'Update accepted a mixed-content directory' >&2; exit 1
fi
[[ $(cat "$destination/README.md") == keep ]]
[[ $(cat "$destination/old.png") == old ]]
rm "$destination/README.md"
BUILD_WORKSPACE_DIRECTORY="$workspace" "$updater"
[[ ! -e "$destination/old.png" ]]
[[ $(cat "$destination/new.png") == 'new capture' ]]
