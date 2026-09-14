# Optional Linux runtime preset

`noble_20260901` is a file selection, not an Ubuntu installation. Its lock pins
Ubuntu Noble archives from 2026-09-01; Bazel's `http_archive` downloads and verifies
them. Callers can replace the preset through `linux_chromium_runtime(system=...)`.
Chromium and Node remain caller-owned inputs.

The manifest's `paths` selects the ELF dependency closure for the example's
Chrome for Testing 153 headless shell (including its bundled graphics libraries),
Node 24, and Bash/env/dirname/uname/readlink. NSS's dynamically loaded
`libnssckbi`, `libsoftokn3`, `libfreebl3`, and `libfreeblpriv3` modules are included
explicitly. Unrelated package-management tools, OS setup files, and Mesa/LLVM
GPU drivers are omitted. This preset targets headless software rendering.

The font files and fontconfig policy are retained as explicit rendering inputs.
They are not inferred from ELF dependencies. Adding custom fonts remains a
caller choice through `fonts`; changing the system/font preset may require new
screenshots.

`browserPackages` lists only packages supplying these selected files. Bazel's native test-wrapper utilities are built separately from source; see
[internal test tools](../../internal/test_tools/README.md).

To update the preset, inspect ELF `DT_NEEDED` entries recursively against the
pinned package contents, account for dynamically loaded modules, and update the
explicit file selection and package checksums. Do not discover dependencies
from host libraries during builds. Validate both the actiond integration suite
and a real consumer's screenshot comparisons; ELF inspection alone cannot
establish browser compatibility.
