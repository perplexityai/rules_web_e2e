#!/usr/bin/env bash
# Requires an already running amd64 actiond worker. No local execution fallback.
set -euo pipefail
work=${1:?usage: run-actiond.sh ABSOLUTE_WORK_DIRECTORY GRPC_ENDPOINT}
endpoint=${2:?supply the actiond GRPC endpoint}
cd "$work/workspace"
"${ACTIOND_BAZEL:-bazel}" --output_base="$work/bazel-output" build //:capture \
  --host_platform=//:linux_amd64 --platforms=//:linux_amd64 \
  --remote_executor="$endpoint" --remote_cache="$endpoint" \
  --spawn_strategy=remote --remote_local_fallback=false \
  --remote_upload_local_results=false --noremote_cache_compression \
  --remote_download_outputs=all
mkdir -p "$work/results"
cp bazel-bin/screenshots/*.png "$work/results/"
