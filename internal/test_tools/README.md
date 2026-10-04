# Native test tools

Bazel's `test-setup.sh` executes before our native browser test. Its utilities
 declared test runfiles, built for Linux x86-64 with hermetic LLVM and musl:

- Toybox: filesystem operations, find, grep, sed, ps, and pgrep.
- libmagic: file and its compiled MIME database.
- Info-ZIP: packaging undeclared test outputs.

All three executables static. Launcher calls their runfile paths directly
through `BASH_ENV` functions and sets `MAGIC` to declared database. actiond
still supplies pinned static Bash requested by `requires-bash`. Browser
libraries and fonts remain separate, caller-selectable runtime inputs.

Private launcher adapter maps Bazel's exact `pgrep -a -g PGID` probe to
Toybox's `pgrep -g PGID`. Bazel only checks for nonempty output; it does not
consume full command line requested by procps's `-a` flag. Other invocations
retain Toybox's native argument handling.

Tools' platform transition selects pinned LLVM toolchain only for this
bundle, without replacing caller's C/C++ toolchains globally. Libmagic
database compiler runs on build execution platform and also uses musl on
Linux; cross-compiling test tools from macOS does not execute Linux binaries.

`repositories.bzl` pins source archives and BCR overlays. Two small local
patches applied through repository rules so they also apply in consuming
modules (root-only module overrides would not):

- Toybox: use musl's syslog-name definitions in compilation unit using them,
  and make `pgrep -g` select process groups instead of Unix groups used by `ps -g`.
- libmagic: compile its database using declared Python/compiler inputs instead
  of host cat/mv/rm commands, with static Linux build-time compiler.

Overlays' module-version expressions fixed to pinned source versions
because these patched sources repositories, not independent Bazel modules.
Info-ZIP uses BCR module unchanged. These compatibility/build fixes can be
upstreamed, after which patched repositories can become ordinary module deps.

`bazel test //internal/test_tools:tools_test` checks ELF dependencies and
launcher's actual command flags with empty PATH, including process groups,
symlinks, MIME detection, and ZIP output. Actiond integration suite exercises
actual Bazel test launcher, retries, cancellation, and browser execution.
