#!/usr/bin/env bash
# Exercise source-file visibility and runfiles in both root and consumer builds.
set -euo pipefail

grep -Eq 'name = "rules_web_e2e"' "$1"
test -s "$2"
