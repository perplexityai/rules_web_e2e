#!/usr/bin/env bash
# Build and exercise VRT through a local Apple Virtualization Linux ARM64 VM.
set -euo pipefail
[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || {
  echo 'Run this script on an Apple Silicon Mac with Xcode command-line tools.' >&2
  exit 1
}
work=${1:?usage: run-macos-arm64.sh ABSOLUTE_WORK_DIRECTORY}
[[ $work = /* && $work != *' '* ]] || { echo 'Use an absolute work directory without spaces' >&2; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)
export ACTIOND_ARCH=arm64
bazel_bin=${ACTIOND_BAZEL:-bazelisk}
export ACTIOND_BAZEL="$bazel_bin"
command -v "$bazel_bin" >/dev/null
command -v node >/dev/null
xcrun --find clang >/dev/null
bash "$here/prepare.sh" "$work"
node "$here/prepare-public.mjs" "$work"
(
  cd "$work/actiond"
  flags=(--bes_backend= --remote_executor= --remote_cache= --spawn_strategy=local --jobs=2)
  target=//cmd/darwin-actiond:darwin-actiond_macos_arm64
  if ! "$bazel_bin" --output_base="$work/worker-output" build "${flags[@]}" "$target" > "$work/worker-build.log" 2>&1; then
    echo "Worker build failed; see $work/worker-build.log" >&2
    tail -n 60 "$work/worker-build.log" >&2
    exit 1
  fi
  worker=$("$bazel_bin" --output_base="$work/worker-output" cquery "${flags[@]}" "$target" --output=starlark '--starlark:expr=providers(target)["DefaultInfo"].files_to_run.executable.path')
  cp "$worker" "$work/actiond-worker"
)
# The upstream target signs the executable with the virtualization entitlement.
# Port 8980 must be free: do not accidentally test an unrelated worker.
python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 8980))
PY
"$work/actiond-worker" serve-vm --root="$work/vm" --listen=127.0.0.1:8980 --memory-mib=6144 --cpus=2 --cas-image-size-mib=4096 > "$work/vm.log" 2>&1 &
worker_pid=$!
trap 'kill "$worker_pid" 2>/dev/null || true' EXIT
ready=false
for ((attempt=0; attempt<90; attempt++)); do
  kill -0 "$worker_pid" || { cat "$work/vm.log" >&2; exit 1; }
  if (echo > /dev/tcp/127.0.0.1/8980) 2>/dev/null; then ready=true; break; fi
  sleep 1
done
"$ready" || { cat "$work/vm.log" >&2; exit 1; }
bash "$here/run-public-actiond.sh" "$work" grpc://127.0.0.1:8980
