#!/bin/bash
set -euo pipefail

# This launcher runs as a Bazel action, whose cwd is the execution root.
# Bootstrap the declared library and its utilities by execpath. All application
# files below are resolved with the standard Bash runfiles library.
execroot="$PWD"
%{runfiles_commands}
source "%{runfiles_library}"
runfiles_export_envvars
# Playwright discovery and the Node runner require a directory runfiles tree.
[[ -n "${RUNFILES_DIR:-}" && -d "$RUNFILES_DIR" ]] || {
  echo 'Browser capture requires directory runfiles' >&2
  exit 1
}
export RUNFILES_DIR="$(cd "$RUNFILES_DIR" && pwd)"
root="$(rlocation '%{runtime}' '')"
bootstrap="$(rlocation '%{bootstrap}' '')"
job="$(rlocation '%{job}' '')"
export LD_LIBRARY_PATH="%{library_path}"
exec "$root/%{node}" "$bootstrap" "$job" "$@"
