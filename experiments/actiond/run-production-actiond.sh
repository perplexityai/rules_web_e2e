#!/usr/bin/env bash
set -euo pipefail
work=${1:?usage: run-production-actiond.sh ABSOLUTE_WORK_DIRECTORY ENDPOINT}
endpoint=${2:?missing actiond endpoint}
cd "$work/workspace"
"${ACTIOND_BAZEL:-bazelisk}" --output_base="$work/production-bazel-output" build //:production \
  --host_platform=//:linux_amd64 --platforms=//:linux_amd64 \
  --remote_executor="$endpoint" --remote_cache="$endpoint" \
  --spawn_strategy=remote --remote_local_fallback=false \
  --remote_upload_local_results=false --noremote_cache_compression \
  --remote_download_outputs=all
mkdir -p "$work/results/production"
cp -R bazel-bin/production-results/. "$work/results/production/"
