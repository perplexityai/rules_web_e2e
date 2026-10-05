# Browser runtimes

## Basic: versioned preset

In `MODULE.bazel`:

```starlark
browsers = use_extension("@rules_web_e2e//playwright:extensions.bzl", "browser_presets")
browsers.linux_amd64(name = "web_browser", release = "20260921")
use_repo(browsers, "web_browser")
```

Set `browser = "@web_browser//:browser"` on visual or isolated interaction targets.
Release `20260921` pins Chromium 153.0.8010.12, Node 24.14.0, and Noble
`20260901` libraries/fonts; use Playwright 1.63.0 in consuming project.
`@web_browser//:manifest.json` records selected versions and archive checksums.
New environments get new release identifiers; existing presets do not move.
Downloads lazy. Use [worker preset](worker-preset.md) for execution;
your build supplies specs and app assets. [standalone consumer](../examples/preset)
builds and executes runtime binaries
without repository-local configuration in Linux CI on Bazel 8 and 9.

## Advanced: custom binaries and fonts

Use assembly helper:

```starlark
load("@rules_web_e2e//playwright:browser.bzl", "linux_chromium_runtime")

linux_chromium_runtime(
    name = "browser",
    chromium = "@rules_browsers_chrome_linux//:info",
    node = "@nodejs_linux_amd64//:node_bin",
)
```

`chromium` accepts Chrome for Testing headless-shell files or declared directory.
`node` actual Linux Node executable, not launcher script. This helper
supplies executable/loader paths and assembles default
`@rules_web_e2e//playwright/presets:noble_20260901` library/font preset. Its package
URLs and checksums checked in; consumers do not resolve APT dependencies.
If tests record video, pass `ffmpeg = "//:pinned_ffmpeg"`. Cached Bazel action builds
versioned helper directory from declared Playwright core metadata and browser
runtime. Test consumes this immutable directory through
`PLAYWRIGHT_BROWSERS_PATH`; it does not stage or download helper at startup.
Cached build action checks declared Playwright package versions. Mismatch
fails build before browser starts. Consumer-inferred packages still checked
at test startup.
Add `fonts = [":brand_fonts"]` for declared font files/directories, or set `system`
to custom declared directory containing `lib/`, `bin/bash`, `etc/fonts/`, and
`fonts/` with same layout. System preset must not contain Node or Chromium.
Use `browser_runtime` below for other layouts. Assembled output itself
directory, so it can also be exported by caller-owned packaging rules.

Caller selects Chromium's version through its downloader (`rules_browsers`
or checksum-pinned archives). Rules do not silently upgrade it. Before VRT,
runner compares actual binary's `--version` to selected Playwright
package's `browsers.json` and reports mismatch with upgrade guidance.

## Advanced: custom runtime layout

Unpack declared filesystem archive:

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

`:runtime_tar` declared file target. It can be built by caller or fetched
with Bazel's downloader using pinned checksum. Paths above describe
prototype's layout; select paths matching caller's runtime.

Archive extraction uses Bazel-provided Python interpreter and makes no network
requests. Absolute archive symlinks resolved within archive root, then links
 materialized into regular files and directories for output tree. Missing
link targets errors, so runtime packaging cannot silently borrow host files.
Font configuration must use paths relative to its configuration file, rather
than absolute system or build-machine paths.

Execution uses pinned worker's glibc 2.39 and standard ELF interpreter paths.
Runner executes declared Node/Chromium and caller programs unchanged; it does
not repair executable layouts. Legacy `loader` and `bash` descriptor fields
remain accepted for source compatibility, but execution no longer uses them.
See [execution details and shell limitations](actiond.md).

By default, VRT inputs configured for Linux amd64 even when Bazel client runs on
macOS. Caller with additional native toolchain constraints can set
`target_platform = "//platforms:linux_x86_64_gnu"` on its visual target. That
platform must target Linux, match `target_arch`, and match runtime's ABI. `data` and
`$(rootpath ...)` expressions in `env` evaluated in this configuration,
including expressions nested inside JSON strings used by fixture servers.

To assemble runtime from distribution packages, use `archives` for package data
tars and `paths` to select their runtime files. `files` adds declared files or
single directory outputs, such as checksum-pinned Chromium download:

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

Caller owns package selection and pins. [complete example](../examples/browser-runtime)
uses public runtime helper with versioned Ubuntu Noble preset, plus
checksum-pinned Chrome for Testing and Node downloads. It also includes
shell utilities for fixture launchers. Only filesystem archives and declared files
 accepted; there no container image interface.

Archives extracted in order into one filesystem. Selected links may resolve
across packages, but never outside that filesystem. Unselected package contents
 omitted. `exclude` omits archive-relative files or directories before selection;
links to excluded targets still fail. Destination paths must not overlap, and added files cannot overwrite
archive content. Assembler does not discover library dependencies or run
package installation scripts. Preserve distribution's fontconfig policy files
alongside top-level configuration with relative font paths.

## Build the example runtime

[custom assembly example](../examples/browser-runtime/BUILD.bazel) supplies
its own pinned Chromium and Node archives:

```sh
cd examples/browser-runtime
bazel build //:browser
bazel cquery //:browser --output=files
```

Pass its declared directory to `browser_runtime(root=...)` when composing
runtime. [React example](../examples/react/README.md) uses complete preset
instead and needs no tar export.

## ARM64 VRT runtimes

`linux_chromium_runtime(arch = "arm64", ...)` selects ARM64 Noble system
preset and AArch64 loader. Supply matching Linux ARM64 Chromium and Node archives;
assembly checks ELF architecture of Chromium, Node, Bash, and loader.
Existing calls default to `arch = "x64"`. Use `target_arch = "arm64"` on VRT
target to select matching Linux inputs and worker constraints. See
[local Apple Silicon guide](macos-arm64-vrt.md) and
[ARM64 example](../examples/browser-runtime/BUILD.bazel).
