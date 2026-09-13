#!/usr/bin/env bash
set -euo pipefail
work=${1:?usage: run-public-actiond.sh ABSOLUTE_WORK_DIRECTORY ENDPOINT}
endpoint=${2:?missing actiond endpoint}
cd "$work/public"
collect() {
  mkdir -p "$work/results/public"
  for item in __actiond_native__ __actiond_gallery__ bazel-testlogs/actiond_native_test bazel-testlogs/actiond_gallery_test bazel-bin/actiond_native_test_capture.results bazel-bin/actiond_gallery_test_capture.results bazel-bin/actiond_native_test_compare.results bazel-bin/actiond_gallery_test_compare.results; do
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
"${bazel_cmd[@]}" test //:actiond_native_test //:actiond_gallery_test "${flags[@]}" --test_output=errors
