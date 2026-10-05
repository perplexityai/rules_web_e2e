#!/bin/bash
set -euo pipefail
case "$OSTYPE:$HOSTTYPE:%{arch}" in
  linux*:x86_64:x64|linux*:aarch64:arm64) ;;
  *) echo 'Local browser execution requires a matching Linux %{arch} host; use actiond for VM execution.' >&2; exit 1 ;;
esac
if [[ -n "${TEST_SRCDIR:-}" ]]; then
  lookup="$TEST_SRCDIR/%{lookup_runfile}"
  library="$TEST_SRCDIR/%{library_runfile}"
  RUNFILES_DIR=$TEST_SRCDIR
else
  lookup="$PWD/%{lookup_execpath}"
  library='%{library_execpath}'
fi
cut() { "$lookup" cut "$@"; }
grep() { "$lookup" grep "$@"; }
sed() { "$lookup" sed "$@"; }
tr() { "$lookup" tr "$@"; }
uname() { "$lookup" uname "$@"; }
source "$library"
runfiles_export_envvars
[[ -n "${RUNFILES_DIR:-}" && -d "$RUNFILES_DIR" ]] || {
  echo 'Local browser execution requires directory runfiles' >&2; exit 1;
}
runfiles=$(cd "$RUNFILES_DIR" && pwd -P)
bwrap=$(rlocation '%{bwrap}' '')
if ! "$bwrap" --unshare-all --die-with-parent --ro-bind "$lookup" /toybox /toybox true; then
  echo 'Local browser execution needs unprivileged user, mount, PID, and network namespaces. Check kernel/AppArmor policy; see docs/local-linux.md. No host fallback is used.' >&2
  exit 1
fi
root=$(rlocation '%{root}' '')
manifest=$(rlocation '%{mounts}' '')
if [[ '%{mode}' == test ]]; then
  output=${TEST_UNDECLARED_OUTPUTS_DIR:?Run browser tests with bazel test}
else
  output=${1:?Capture output directory required}
  shift
fi
"$lookup" mkdir -p "$output"
output=$(cd "$output" && pwd -P)
report_args=()
if [[ -n "${XML_OUTPUT_FILE:-}" ]]; then
  reports=$(cd "${XML_OUTPUT_FILE%/*}" && pwd -P)
  report_args+=(--bind "$reports" /reports --setenv XML_OUTPUT_FILE "/reports/${XML_OUTPUT_FILE##*/}")
fi
for key in TEST_TOTAL_SHARDS TEST_SHARD_INDEX TEST_RANDOM_SEED TEST_RUN_NUMBER; do
  if [[ -n "${!key:-}" ]]; then report_args+=(--setenv "$key" "${!key}"); fi
done
if [[ -n "${TEST_SHARD_STATUS_FILE:-}" ]]; then
  "$lookup" touch "$TEST_SHARD_STATUS_FILE"
  report_args+=(--bind "$TEST_SHARD_STATUS_FILE" /shard-status --setenv TEST_SHARD_STATUS_FILE /shard-status)
fi
# Bubblewrap reads NUL-delimited arguments from an fd, avoiding argv limits.
# Each mount comes from a declared File or a standard Bazel runfiles symlink.
exec 3< <(
  if [[ -f "$runfiles/_repo_mapping" ]]; then
    printf '%s\0' --ro-bind "$runfiles/_repo_mapping" /runfiles/_repo_mapping
  fi
  while IFS= read -r -d '' kind && IFS= read -r -d '' source && IFS= read -r -d '' destination; do
    case "$kind" in
      file) printf '%s\0' --ro-bind "$runfiles/$source" "$destination" ;;
      link) printf '%s\0' --symlink "$("$lookup" readlink "$runfiles/$source")" "$destination" ;;
      alias) printf '%s\0' --symlink "/runfiles/$source" "$destination" ;;
    esac
  done < "$manifest"
)
args=(--unshare-all --die-with-parent --new-session --cap-drop ALL
  --proc /proc --dev /dev --tmpfs /tmp --dir /tmp/home
  --args 3 --ro-bind "$root/lib" /lib --symlink lib /lib64
  --ro-bind "$root/bin" /bin --symlink /bin /usr/bin
  --bind "$output" /outputs
  --clearenv --setenv PATH /bin --setenv HOME /tmp/home --setenv USER test
  --setenv LANG C --setenv LC_ALL C --setenv TZ UTC --setenv TMPDIR /tmp
  --setenv LD_LIBRARY_PATH /lib --setenv RUNFILES_DIR /runfiles
  --setenv TEST_SRCDIR /runfiles --setenv TEST_WORKSPACE "${TEST_WORKSPACE:-_main}"
  --setenv TEST_TMPDIR /tmp --setenv TEST_UNDECLARED_OUTPUTS_DIR /outputs
  --setenv JS_BINARY__EXECROOT /execroot --setenv VRT_EXECUTION local
  --chdir /execroot)
if [[ '%{mode}' == capture ]]; then set -- /outputs "$@"; fi
exec "$bwrap" "${args[@]}" "${report_args[@]}" "/runfiles/%{root}/%{node}" "/runfiles/%{bootstrap}" "/runfiles/%{job}" "$@"
