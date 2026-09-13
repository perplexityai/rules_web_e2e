#!/usr/bin/env bash
# Setup-only prototype: run inside the pinned Playwright image.
set -euo pipefail
out=${1:-/output}
mkdir -p "$out"/{bin,lib,chromium,etc/fonts,fonts}
cp /usr/bin/node /bin/bash "$out/bin/"
cp -a /ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/. "$out/chromium/"
for binary in /usr/bin/node /bin/bash /ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell; do
  ldd "$binary" | awk '/=> \// {print $3} /^\s*\/lib/ {print $1}' | while read -r lib; do
    cp -L "$lib" "$out/lib/"
  done
done
cp -L /lib64/ld-linux-x86-64.so.2 "$out/lib/"
cp -a /usr/share/fonts/. "$out/fonts/"
cat > "$out/etc/fonts/fonts.conf" <<'XML'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>/workspace/runtime/fonts</dir>
  <cachedir>/tmp/fontconfig</cachedir>
</fontconfig>
XML
cat > "$out/chrome" <<'SH'
#!/workspace/runtime/bin/bash
exec /workspace/runtime/chromium/chrome-headless-shell "$@"
SH
chmod +x "$out/chrome"
tar -C "$out" -cf - .
