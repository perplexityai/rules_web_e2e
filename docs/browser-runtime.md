# Declared browser runtimes

The actiond migration accepts caller-owned Linux runtime files through
`browser_runtime`. The runtime must contain Chromium, Node, their ELF loader and
shared libraries, and the fonts/fontconfig used for screenshots. Include Bash
and the shell utilities used by fixture launchers (including `dirname`, `uname`,
and `readlink` for Bazel `js_binary`). These files stay inside the runtime tree;
they are not installed at system paths.

For the common Linux amd64 case, use the public helper:

```starlark
load("@rules_web_e2e//playwright:browser.bzl", "linux_chromium_runtime")

linux_chromium_runtime(
    name = "browser",
    chromium = "@rules_browsers_chrome_linux//:info",
    node = "@nodejs_linux_amd64//:node_bin",
)
```

`chromium` accepts Chrome for Testing headless-shell files or a declared directory.
`node` is the actual Linux Node executable, not a launcher script. This helper
supplies the executable/loader paths and assembles the default
`@rules_web_e2e//playwright/presets:noble_20260901` library/font preset. Its package
URLs and checksums are checked in; consumers do not resolve APT dependencies.
The preset includes libatomic for Node 26. The optional preset selects an explicit shared-library closure, five shell
executables, and the existing font/fontconfig policy. It excludes unrelated OS
packages and graphics drivers. Font changes may require screenshot regeneration.

Add `fonts = [":brand_fonts"]` for declared font files/directories, or set `system`
to a custom declared directory containing `lib/`, `bin/bash`, `etc/fonts/`, and
`fonts/` with the same layout. A system preset must not contain Node or Chromium.
Use `browser_runtime` below for other layouts. The assembled output itself is a
directory, so it can also be exported by caller-owned packaging rules.

The caller selects Chromium's version through its downloader (`rules_browsers`
or checksum-pinned archives). The rules do not silently upgrade it. Before VRT,
the runner compares the actual binary's `--version` to the selected Playwright
package's `browsers.json` and reports a mismatch with upgrade guidance.

A caller can produce a flattened filesystem tar and unpack it during the Bazel
build:

```starlark
load("@rules_web_e2e//playwright:archive.bzl", "browser_runtime_archive")
load("@rules_web_e2e//playwright:defs.bzl", "browser_runtime")
load("@rules_web_e2e//vrt:defs.bzl", "visual_test")

browser_runtime_archive(
    name = "runtime_files",
    archive = ":runtime_tar",
)

browser_runtime(
    name = "browser",
    root = ":runtime_files",
    executable = "chromium/chrome-headless-shell",
    node = "bin/node",
    loader = "lib/ld-linux-x86-64.so.2",
    bash = "bin/bash",
    library_dirs = ["lib"],
    fontconfig = "etc/fonts",
)

visual_test(
    name = "visuals",
    browser = ":browser",
    tests = ":compiled_visual_specs",
    shell = ":app_shell",
    baselines = glob(["__screenshots__/*.png"]),
)
```

`:runtime_tar` is a declared file target. It can be built by the caller or fetched
with Bazel's downloader using a pinned checksum. Paths above describe the
prototype's layout; select paths matching the caller's runtime.

Archive extraction uses a Bazel-provided Python interpreter and makes no network
requests. Absolute archive symlinks are resolved within the archive root, then links
are materialized into regular files and directories for the output tree. Missing
link targets are errors, so runtime packaging cannot silently borrow host files.
Font configuration must use paths relative to its configuration file, rather
than absolute system or build-machine paths.

`loader` and `bash` default to the paths shown above. Execution starts the
declared loader directly. The VRT runner creates `/tmp/rules-web-vrt` inside its
isolated action, copies the loader/Node/Bash there, and rewrites staged ELF64
interpreter paths to that loader. This retains executable identity for Chromium
subprocesses. Interpreter segments too short for the replacement are rejected.
Original declared inputs are never modified.

Executable scripts with ordinary `/bin/sh`, `/bin/bash`, `/usr/bin/env bash`,
or Node shebangs are redirected to the declared launchers. The VRT subprocess
adapter supplies Bash for Playwright's `shell: true` launches. Other hardcoded
system paths, interpreters, and complex `env -S` shebangs need caller-owned
wrappers or packaging changes; arbitrary binaries are not automatically
relocatable.

Execution requires a pinned actiond worker matching the Linux runtime CPU. The remote
actions produce comparison/capture results; the local test command reports their
status and `.update` applies successful captures. Host E2E/component-browser
targets continue to use their existing browser setup. Native and component
capture/comparison through the public rules passed the Linux VM workflow.

By default, VRT inputs are configured for Linux amd64 even when the Bazel client runs on
macOS. A caller with additional native toolchain constraints can set
`target_platform = "//platforms:linux_x86_64_gnu"` on its visual target. That
platform must target Linux, match `target_arch`, and match the runtime's ABI. `data` and
`$(rootpath ...)` expressions in `env` are evaluated in this configuration,
including expressions nested inside JSON strings used by fixture servers.

To assemble a runtime from distribution packages, use `archives` for package data
tars and `paths` to select their runtime files. `files` adds declared files or
single directory outputs, such as a checksum-pinned Chromium download:

```starlark
browser_runtime_archive(
    name = "runtime_files",
    archives = ["@vrt_noble//:packages"],
    paths = {
        "usr/bin/bash": "bin/bash",
        "usr/lib/x86_64-linux-gnu": "lib",
        "usr/share/fonts": "fonts",
        "etc/fonts/conf.d": "etc/fonts/conf.d",
    },
    files = {
        ":chromium_directory": "chromium",
        ":node_binary": "bin/node",
        ":fonts.conf": "etc/fonts/fonts.conf",
    },
)
```

The caller owns package selection and pins. The [complete example](../examples/browser-runtime)
uses the public runtime helper with a versioned Ubuntu Noble preset, plus
checksum-pinned Chrome for Testing and Node downloads. It also includes
shell utilities for fixture launchers. Only filesystem archives and declared files
are accepted; there is no container image interface.

Archives are extracted in order into one filesystem. Selected links may resolve
across packages, but never outside that filesystem. Unselected package contents
are omitted. `exclude` omits archive-relative files or directories before selection;
links to excluded targets still fail. Destination paths must not overlap, and added files cannot overwrite
archive content. The assembler does not discover library dependencies or run
package installation scripts. Preserve the distribution's fontconfig policy files
alongside a top-level configuration with relative font paths.

## Build the example runtime

From the repository root, build the Linux amd64 runtime using Bazel 9 and package
its declared directory for the React example:

```sh
(
  cd examples/browser-runtime
  bazelisk build //:browser
  runtime_files=$(bazelisk cquery //:browser --output=files)
  tar -C "$runtime_files" -cf ../react/runtime.tar .
)
```

The checked-in preset manifest pins only the packages supplying selected runtime
files. Bazel `http_archive` downloads and verifies every package; no apt resolver
or package installation scripts run in consuming workspaces. Chromium and Node use
explicit archive checksums. The VRT action itself runs offline; repository
acquisition happens before execution. Callers can instead pass the assembled
directory directly to `browser_runtime(root=...)` without this tar export.

## ARM64 VRT runtimes

`linux_chromium_runtime(arch = "arm64", ...)` selects the ARM64 Noble system
preset and AArch64 loader. Supply matching Linux ARM64 Chromium and Node archives;
assembly checks the ELF architecture of Chromium, Node, Bash, and the loader.
Existing calls default to `arch = "x64"`. Use `target_arch = "arm64"` on the VRT
target to select matching Linux inputs and worker constraints. See the
[local Apple Silicon guide](macos-arm64-vrt.md) and the
[ARM64 example](../examples/browser-runtime/BUILD.bazel).
