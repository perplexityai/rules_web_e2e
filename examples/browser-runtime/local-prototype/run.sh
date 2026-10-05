#!/bin/bash
# Experimental feasibility probe; not a production execution backend.
set -euo pipefail
bundle=$(realpath "$1")
playwright=$(realpath "$2")
if [[ -f "$playwright" ]]; then playwright=${playwright%/*}; fi
if [[ -n "${TEST_UNDECLARED_OUTPUTS_DIR:-}" ]]; then
  output=$TEST_UNDECLARED_OUTPUTS_DIR
  shift 2
else
  output=$(realpath "$3")
  shift 3
fi
if [[ -n "${TEST_SRCDIR:-}" ]]; then
  probe="$TEST_SRCDIR/$TEST_WORKSPACE/local-prototype"
else
  probe=$(dirname "$(realpath "$0")")
fi
mask=()
if [[ "${PROBE_EXPECT_MISSING_LIBRARY:-0}" == 1 ]]; then
  mask=(--ro-bind /dev/null /lib/libnss3.so)
fi
exec "${BWRAP:-bwrap}" --unshare-all --die-with-parent --new-session --cap-drop ALL \
  --ro-bind "$bundle" /runtime \
  --ro-bind "$bundle/lib" /lib --symlink lib /lib64 \
  --ro-bind "$bundle/bin" /bin --symlink /bin /usr/bin \
  --ro-bind "$playwright" /playwright \
  --ro-bind "$probe/probe.mts" /probe.mts \
  --bind "$output" /output \
  --proc /proc --dev /dev --tmpfs /tmp --dir /tmp/home \
  --clearenv --setenv PATH /bin --setenv HOME /tmp/home \
  --setenv LD_LIBRARY_PATH /lib --setenv FONTCONFIG_PATH /runtime/etc/fonts \
  --setenv LANG C.UTF-8 --setenv TZ UTC \
  --setenv PROBE_EXPECT_MISSING_LIBRARY "${PROBE_EXPECT_MISSING_LIBRARY:-0}" \
  --setenv LD_DEBUG libs,files --setenv LD_DEBUG_OUTPUT /output/loader \
  "${mask[@]}" "$@" --chdir /tmp /bin/node /probe.mts
