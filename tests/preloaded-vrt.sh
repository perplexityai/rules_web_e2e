#!/usr/bin/env bash
# Build with Bazel, then execute the public VRT lifecycle in an OS-only runner.
set -euo pipefail
vrt_root=$(cd "$(dirname "$0")/.." && pwd)
vrt_bazel=${VRT_BAZEL:-bazelisk}
cd "$vrt_root/examples/react"
"$vrt_bazel" build //:preloaded_vrt_test
vrt_output=$("$vrt_bazel" info output_base)
vrt_install=$("$vrt_bazel" info install_base)
vrt_bin=$("$vrt_bazel" info bazel-bin)
vrt_launcher="$vrt_bin/preloaded_vrt_test_/preloaded_vrt_test"
vrt_docker_args=()
# Bazel 9 may symlink declared external repositories into its shared content cache.
# Mount only those resolved repository directories, not the developer's HOME.
declare -A vrt_mounted=()
while IFS= read -r -d '' vrt_link; do
  vrt_dependency=$(readlink -f "$vrt_link")
  [[ -d "$vrt_dependency" ]] || continue
  case "$vrt_dependency" in "$vrt_root"|"$vrt_root"/*|"$vrt_output"/*|"$vrt_install"/*) continue ;; esac
  [[ -z "${vrt_mounted[$vrt_dependency]:-}" ]] || continue
  vrt_mounted[$vrt_dependency]=1
  vrt_docker_args+=(--mount "type=bind,source=$vrt_dependency,target=$vrt_dependency,readonly")
done < <(find "$vrt_output/external" -maxdepth 1 -type l -print0)
if [[ -n "${DOCKER_HOST:-}" && "$DOCKER_HOST" != unix:* ]]; then
  vrt_docker_args+=(--env DOCKER_HOST)
else
  vrt_socket=${DOCKER_HOST:-}
  vrt_socket=${vrt_socket#unix://}
  vrt_socket=${vrt_socket:-/var/run/docker.sock}
  vrt_docker_args+=(--mount "type=bind,source=$vrt_socket,target=/var/run/docker.sock" --env DOCKER_HOST=unix:///var/run/docker.sock)
fi
# This image is the test envelope, not a rules-managed runtime image. It contains
# neither Node nor Chromium. Linux host networking keeps relay loopback reachable.
docker run --rm --init --platform linux/amd64 --network host \
  --mount "type=bind,source=$vrt_root,target=$vrt_root,readonly" \
  --mount "type=bind,source=$vrt_output,target=$vrt_output" \
  --mount "type=bind,source=$vrt_install,target=$vrt_install,readonly" \
  --workdir "$vrt_root/examples/react" \
  "${vrt_docker_args[@]}" \
  ubuntu:24.04@sha256:224a1869083a311ef3f13648a154ba79832fbef6364d31493642ca03082da254 \
  bash -c '
    set -eu
    for program in node nodejs chromium chromium-browser google-chrome docker; do
      if command -v "$program"; then echo "Unexpected host tool: $program" >&2; exit 1; fi
    done
    mkdir -p /tmp/home /tmp/test /tmp/outputs
    export BAZEL_BINDIR=. HOME=/tmp/home TEST_TMPDIR=/tmp/test TEST_UNDECLARED_OUTPUTS_DIR=/tmp/outputs
    exec "$1"
  ' bash "$vrt_launcher"
