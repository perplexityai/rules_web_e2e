#!/usr/bin/env bash
set -euo pipefail
work=${1:?usage: run-public-actiond.sh ABSOLUTE_WORK_DIRECTORY ENDPOINT}
endpoint=${2:?missing actiond endpoint}
cd "$work/public"
collect() {
  mkdir -p "$work/results/public"
  for item in __actiond_native__ __actiond_gallery__ __actiond_failed__ __actiond_isolation__ bazel-testlogs/actiond_*_test bazel-bin/actiond_*_test_*.results; do
    if [[ -e $item ]]; then cp -RL "$item" "$work/results/public/"; fi
  done
}
trap collect EXIT
flags=(
  --remote_executor="$endpoint" --remote_cache="$endpoint"
  --spawn_strategy=local --strategy=VrtCapture=remote --strategy=VrtCompare=remote
  --remote_local_fallback=false --remote_upload_local_results=false
  --noremote_cache_compression --remote_download_outputs=all
)
bazel_cmd=("${ACTIOND_BAZEL:-bazelisk}" --output_base="$work/public-bazel-output")
"${bazel_cmd[@]}" run //:actiond_native_test.update "${flags[@]}"
"${bazel_cmd[@]}" run //:actiond_gallery_test.update "${flags[@]}"
test -s __actiond_native__/saved.png
test -s __actiond_gallery__/counter.png
"${bazel_cmd[@]}" test //:actiond_native_test //:actiond_gallery_test //:actiond_isolation_test "${flags[@]}" --test_output=errors

# A successful suite with no screenshots must not erase existing references.
mkdir -p __actiond_isolation__
cp __actiond_native__/saved.png __actiond_isolation__/keep.png
if "${bazel_cmd[@]}" run //:actiond_isolation_test.update "${flags[@]}"; then
  echo 'Expected an empty capture to be rejected' >&2
  exit 1
fi
cmp __actiond_native__/saved.png __actiond_isolation__/keep.png
python3 - <<'PY'
import json
from pathlib import Path
result = json.loads(Path('bazel-bin/actiond_isolation_test_capture.results/result.json').read_text())
assert result['mode'] == 'capture' and result['exitCode'] != 0, result
PY

# Failed captures produce artifacts but must not modify any source baseline.
mkdir -p __actiond_failed__
cp __actiond_native__/saved.png __actiond_failed__/keep.png
if "${bazel_cmd[@]}" run //:actiond_failure_test.update "${flags[@]}"; then
  echo 'Expected the deliberate capture failure' >&2
  exit 1
fi
cmp __actiond_native__/saved.png __actiond_failed__/keep.png
test ! -e __actiond_failed__/partial.png
test -s bazel-bin/actiond_failure_test_capture.results/artifacts/reference/partial.png
test -s bazel-bin/actiond_failure_test_capture.results/artifacts/junit.xml
python3 - <<'PY'
import json
from pathlib import Path
result = json.loads(Path('bazel-bin/actiond_failure_test_capture.results/result.json').read_text())
assert result['mode'] == 'capture' and result['exitCode'] != 0, result
PY

# A mismatched reference must fail the local test, with downloaded diff images.
cp __actiond_native__/saved.png "$work/native-baseline.png"
cp __actiond_gallery__/counter.png __actiond_native__/saved.png
if "${bazel_cmd[@]}" test //:actiond_native_test "${flags[@]}" --test_output=errors; then
  echo 'Expected screenshot comparison to fail' >&2
  exit 1
fi
python3 - <<'PY'
import json
from pathlib import Path
directory = Path('bazel-bin/actiond_native_test_compare.results')
result = json.loads((directory / 'result.json').read_text())
assert result['mode'] == 'compare' and result['exitCode'] != 0, result
assert list((directory / 'artifacts').rglob('*-diff.png')), 'Missing screenshot diff'
PY
cp "$work/native-baseline.png" __actiond_native__/saved.png
