#!/usr/bin/env bash
set -euo pipefail
cd "$TEST_SRCDIR/$TEST_WORKSPACE"
"$1" --list > "$TEST_TMPDIR/discovery.txt"
cat "$TEST_TMPDIR/discovery.txt"
grep -q 'auth UI fixture' "$TEST_TMPDIR/discovery.txt"
grep -q 'billing UI fixture' "$TEST_TMPDIR/discovery.txt"
grep -q 'Total: 2 tests in 2 files' "$TEST_TMPDIR/discovery.txt"
! grep -q 'unselected UI fixture' "$TEST_TMPDIR/discovery.txt"
