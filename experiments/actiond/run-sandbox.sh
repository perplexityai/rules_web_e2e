#!/usr/bin/env bash
# Tests the real actiond runner; DOES NOT test its VM, REAPI or actiondfs.
set -euo pipefail
work=${1:?usage: run-sandbox.sh ABSOLUTE_WORK_DIRECTORY [CHROMIUM_FLAGS]}
shift
root="$work/root"
mkdir -p "$root"/{dev,proc,tmp,var/tmp,workspace/outputs} "$work/results"
touch "$root/dev/null"
chmod 1777 "$root/tmp" "$root/var/tmp" "$root/workspace/outputs"
cp -a "$work/workspace/runtime" "$work/workspace/playwright-core" "$work/workspace/capture.mjs" "$work/workspace/ld.so" "$root/workspace/"
rm -f "$root/workspace/outputs/"*.png
container=$(docker create --network none --cap-add SYS_ADMIN --cap-add NET_ADMIN \
  --security-opt seccomp=unconfined --security-opt apparmor=unconfined \
  --pull=never ubuntu:24.04@sha256:224a1869083a311ef3f13648a154ba79832fbef6364d31493642ca03082da254 \
  /bin/bash -c 'mkdir /cas; exec /smoke /action-root /cas /workspace/runtime/bin/node /workspace/capture.mjs "$@"' prototype "$@")
trap 'docker rm -f "$container" >/dev/null' EXIT
docker cp "$root" "$container:/action-root"
docker cp "$work/build/sandbox-smoke" "$container:/smoke"
set +e
docker start -a "$container" 2>&1 | tee "$work/results/sandbox.log"
smoke_exit=${PIPESTATUS[0]}
set -e
docker cp "$container:/action-root/workspace/outputs/." "$work/results/"
exit "$smoke_exit"
