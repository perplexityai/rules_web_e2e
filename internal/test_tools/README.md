# Native test tools

Bazel's `test-setup.sh` executes before our native browser test. Its utilities
are declared test runfiles, built for Linux x86-64 with hermetic LLVM and musl:

- Toybox: filesystem operations, find, grep, sed, ps, and pgrep.
- libmagic: file and its compiled MIME database.
- Info-ZIP: packaging undeclared test outputs.

All three executables are static. The launcher calls their runfile paths directly
through `BASH_ENV` functions and sets `MAGIC` to the declared database. actiond
still supplies the pinned static Bash requested by `requires-bash`. Browser
libraries and fonts remain separate, caller-selectable runtime inputs.

The private launcher adapter maps Bazel's exact `pgrep -a -g PGID` probe to
Toybox's `pgrep -g PGID`. Bazel only checks for nonempty output; it does not
consume the full command line requested by procps's `-a` flag. Other invocations
retain Toybox's native argument handling.

The tools' platform transition selects the pinned LLVM toolchain only for this
bundle, without replacing the caller's C/C++ toolchains globally. The libmagic
database compiler runs on the build execution platform and also uses musl on
Linux; cross-compiling test tools from macOS does not execute Linux binaries.

`repositories.bzl` pins source archives and BCR overlays. Two small local
patches are applied through repository rules so they also apply in consuming
modules (root-only module overrides would not):

- Toybox: use musl's syslog-name definitions in the compilation unit using them,
  and make `pgrep -g` select process groups instead of the Unix groups used by `ps -g`.
- libmagic: compile its database using declared Python/compiler inputs instead
  of host cat/mv/rm commands, with a static Linux build-time compiler.

The overlays' module-version expressions are fixed to the pinned source versions
because these patched sources are repositories, not independent Bazel modules.
Info-ZIP uses the BCR module unchanged. These compatibility/build fixes can be
upstreamed, after which the patched repositories can become ordinary module deps.

`bazel test //internal/test_tools:tools_test` checks ELF dependencies and the
launcher's actual command flags with an empty PATH, including process groups,
symlinks, MIME detection, and ZIP output. The actiond integration suite exercises
the actual Bazel test launcher, retries, cancellation, and browser execution.
