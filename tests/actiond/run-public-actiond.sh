#!/usr/bin/env bash
set -euo pipefail
work=${1:?usage: run-public-actiond.sh ABSOLUTE_WORK_DIRECTORY ENDPOINT}
endpoint=${2:-${RULES_WEB_E2E_ENDPOINT:?missing actiond endpoint}}
case "${ACTIOND_ARCH:-x64}" in x64|arm64) ;; *) echo 'ACTIOND_ARCH must be x64 or arm64' >&2; exit 1 ;; esac
scripts=$(cd "$(dirname "$0")" && pwd)
cd "$work/public"
collect() {
  mkdir -p "$work/results/public"
  for item in __actiond_native__ __actiond_gallery__ __actiond_failed__ __actiond_isolation__ bazel-testlogs/actiond_*_test bazel-bin/actiond_*_test_*.results; do
    if [[ -e $item ]]; then cp -RL "$item" "$work/results/public/"; fi
  done
}
trap collect EXIT
if [[ -n ${RULES_WEB_E2E_BAZELRC:-} ]]; then
  flags=(--config=web-e2e)
else
  flags=(
    --jobs=2
    --remote_default_exec_properties="actiond-worker-sha256=$(shasum -a 256 "$work/actiond-worker" | cut -d ' ' -f 1)"
    --remote_executor="$endpoint" --remote_cache="$endpoint"
    --spawn_strategy=sandboxed,local --strategy=VrtCapture=remote --strategy=VrtCompare=remote --strategy=TestRunner=remote,local
    --remote_local_fallback=false --remote_upload_local_results=false
    --noremote_cache_compression --remote_download_outputs=all
  )
fi
if [[ ${ACTIOND_ARCH:-x64} == arm64 ]]; then
  flags+=(--extra_execution_platforms=@platforms//host:host,@rules_web_e2e//internal:linux_arm64)
fi
bazel_cmd=("${ACTIOND_BAZEL:-bazelisk}" --output_base="$work/public-bazel-output")
if [[ -n ${RULES_WEB_E2E_BAZELRC:-} ]]; then bazel_cmd+=("--bazelrc=$RULES_WEB_E2E_BAZELRC"); fi
# This target is never executed remotely, so it cannot reuse a successful
# capture from the action cache and accidentally skip the rejection check.
mkdir -p "$work/results"
# Host rejection and ordinary test-launcher checks currently require Linux x64.
if [[ ${ACTIOND_ARCH:-x64} == x64 ]]; then
if "${bazel_cmd[@]}" build //:actiond_local_rejection_test_capture \
  --remote_executor= --remote_cache= --disk_cache= --spawn_strategy=sandboxed,local \
  > "$work/results/local-rejection.log" 2>&1; then
  echo 'VRT unexpectedly executed on the host' >&2
  exit 1
fi
python3 - "$work/results/local-rejection.log" <<'PY'
from pathlib import Path
import sys
log = Path(sys.argv[1]).read_text()
assert 'VRT requires an isolated action without system runtimes' in log, log
PY
"${bazel_cmd[@]}" test //:actiond_e2e_test //:actiond_component_test //:actiond_browser_isolation_test "${flags[@]}" --test_output=errors
if "${bazel_cmd[@]}" test //:actiond_browser_failure_test "${flags[@]}" --flaky_test_attempts=2 --nocache_test_results --test_output=errors; then
  echo 'Expected ordinary browser failure to fail the Bazel test' >&2
  exit 1
fi
python3 - <<'PYTEST'
from pathlib import Path
import zipfile
import re
result = Path('bazel-testlogs/actiond_browser_failure_test')
assert 'Intentional ordinary browser failure' in (result / 'test.log').read_text()
ids = {i for p in result.rglob('*.log') for i in re.findall(r'BROWSER_EXECUTION ([a-f0-9-]{36})', p.read_text())}
assert len(ids) == 2, f'Retries did not launch two browsers: {ids}'
archive = result / 'test.outputs/outputs.zip'
if archive.exists():
    with zipfile.ZipFile(archive) as outputs:
        assert 'junit.xml' in outputs.namelist()
else:
    assert (result / 'test.outputs/junit.xml').exists()
PYTEST
# runs_per_test and nocache_test_results must execute Chromium, not replay reports.
for round in 1 2; do
  "${bazel_cmd[@]}" test //:actiond_rerun_test "${flags[@]}" --runs_per_test=2 --nocache_test_results --test_output=errors
  python3 - "$work/results/browser-runs.json" <<'PYRUNS'
import json
from pathlib import Path
import re
import sys
previous = Path(sys.argv[1])
ids = {i for p in Path('bazel-testlogs/actiond_rerun_test').rglob('test.log')
       for i in re.findall(r'BROWSER_EXECUTION ([a-f0-9-]{36})', p.read_text())}
assert len(ids) == 2, f'runs_per_test did not launch two browsers: {ids}'
if previous.exists():
    assert ids.isdisjoint(json.loads(previous.read_text())), 'nocache_test_results replayed a browser run'
previous.write_text(json.dumps(sorted(ids)))
PYRUNS
done
fi
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

# The rule deadline terminates a stuck suite and preserves its partial capture.
mkdir -p __actiond_timeout__
cp __actiond_native__/saved.png __actiond_timeout__/keep.png
if "${bazel_cmd[@]}" run //:actiond_timeout_test.update "${flags[@]}"; then
  echo 'Expected the stuck suite to time out' >&2
  exit 1
fi
cmp __actiond_native__/saved.png __actiond_timeout__/keep.png
test -s bazel-bin/actiond_timeout_test_capture.results/artifacts/reference/partial.png
python3 - <<'PY'
import json
from pathlib import Path
result = json.loads(Path('bazel-bin/actiond_timeout_test_capture.results/result.json').read_text())
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
python3 "$scripts/cancel-public.py" "${bazel_cmd[@]}" -- "${flags[@]}"
# The same worker must execute another action after cancellation.
"${bazel_cmd[@]}" test //:actiond_native_test "${flags[@]}" --remote_accept_cached=false --nocache_test_results --test_output=errors
