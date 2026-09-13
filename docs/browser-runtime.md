# Declared browser runtimes

The actiond migration accepts caller-owned Linux runtime files through
`browser_runtime`. The runtime must contain Chromium, Node, their ELF loader and
shared libraries, and the fonts/fontconfig used for screenshots. Native
Playwright `webServer` commands also need `/bin/sh`.

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
requests. Absolute image symlinks are resolved within the image root, then links
are materialized into regular files and directories for the output tree. Missing
link targets are errors, so runtime packaging cannot silently borrow host files.
Font configuration should use image paths or paths relative to the configuration
file, rather than a build-machine path.

An OCI image tar produced by `docker save` or `oci_load` is not a flattened
filesystem tar. OCI layer application, including whiteouts, must happen before
this rule. Direct OCI-layout support is still migration work in progress.

Execution currently requires a patched actiond Linux amd64 worker. The remote
actions produce comparison/capture results; the local test command reports their
status and `.update` applies successful captures. Host E2E/component-browser
targets continue to use their existing browser setup. Full VM validation of the
public rule path remains a release gate.
