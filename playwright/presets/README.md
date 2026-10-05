# Optional Linux runtime preset

`noble_20260901` file selection, not Ubuntu installation. Its lock pins
Ubuntu Noble archives from 2026-09-01. Bazel downloads and verifies the `.deb`
files, then extracts their inner `data.tar.*` payloads into one repository.
Selected links resolve inside that repository. A declared coreutils action
copies selected files into the runtime directory. No TS unpack action runs
for these presets.

Callers can replace preset through `linux_chromium_runtime(system=...)`.
Chromium and Node remain caller-owned inputs.

Manifest's `paths` selects ELF dependency closure for example's
Chrome for Testing 153 headless shell (including its bundled graphics libraries),
Node 24, and Bash/env/dirname/uname/readlink. NSS's dynamically loaded
`libnssckbi`, `libsoftokn3`, `libfreebl3`, and `libfreeblpriv3` modules included
explicitly. Unrelated package-management tools, OS setup files, and Mesa/LLVM
GPU drivers omitted. This preset targets headless software rendering.

Font files and fontconfig policy retained as explicit rendering inputs.
They not inferred from ELF dependencies. Adding custom fonts remains
caller choice through `fonts`; changing system/font preset may require new
screenshots.

`browserPackages` lists only packages supplying these selected files. Bazel's native test-wrapper utilities built separately from source; see
[internal test tools](../../internal/test_tools/README.md).

To update preset, inspect ELF `DT_NEEDED` entries recursively against
pinned package contents, account for dynamically loaded modules, and update
explicit file selection and package checksums. Do not discover dependencies
from host libraries during builds. Validate both actiond integration suite
and real consumer's screenshot comparisons; ELF inspection alone cannot
establish browser compatibility.
