#!/usr/bin/env bash
# Setup-only prototype: run inside the pinned Playwright image.
set -euo pipefail
out=${1:-/output}
mkdir -p "$out"/{bin,usr/bin,lib,lib64,chromium,etc/fonts,fonts}
cp /usr/bin/node /bin/bash "$out/bin/"
cp /usr/bin/env "$out/usr/bin/"
cp /usr/bin/{dirname,uname,readlink} "$out/bin/"
cp -a /ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/. "$out/chromium/"
for binary in /usr/bin/node /bin/bash /usr/bin/{env,dirname,uname,readlink} /ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell; do
  ldd "$binary" | awk '/=> \// {print $3} /^\s*\/lib/ {print $1}' | while read -r lib; do
    cp -L "$lib" "$out/lib/"
  done
done
cp -L /lib64/ld-linux-x86-64.so.2 "$out/lib/"
cp -L /lib64/ld-linux-x86-64.so.2 "$out/lib64/"
ln -s bash "$out/bin/sh"
cp -aL /usr/share/fonts/. "$out/fonts/"
cat > "$out/etc/fonts/fonts.conf" <<'XML'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir prefix="relative">../../fonts</dir>
  <cachedir>/tmp/fontconfig</cachedir>
</fontconfig>
XML
cat > "$out/chrome" <<'SH'
#!/workspace/runtime/bin/bash
exec /workspace/runtime/chromium/chrome-headless-shell "$@"
SH
chmod +x "$out/chrome"
tar -C "$out" -cf - .
