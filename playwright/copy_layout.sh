#!/usr/bin/env bash
# Copy layout entries with the declared coreutils binary. Inputs stay untouched.
set -euo pipefail
coreutils="$1"
layout="$2"
executables="$3"
output="$4"
"$coreutils" mkdir -p -- "$output"
while IFS= read -r -d "" source && IFS= read -r -d "" destination; do
    target="$output/$destination"
    "$coreutils" mkdir -p -- "${target%/*}"
    "$coreutils" cp -R -L --preserve=mode -T -- "$source" "$target"
done < "$layout"
while IFS= read -r -d "" executable; do
    "$coreutils" chmod 755 -- "$output/$executable"
done < "$executables"
