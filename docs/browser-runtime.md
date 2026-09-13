# Declared browser runtimes

The actiond migration accepts caller-owned Linux runtime files through
`browser_runtime`. The runtime must contain Chromium, Node, their ELF loader and
shared libraries, and the fonts/fontconfig used for screenshots. Native
Playwright `webServer` commands also need `/bin/sh`. Bazel `js_binary` fixture
launchers additionally need `/usr/bin/env`, Bash, and their shell utilities
(including `dirname`, `uname`, and `readlink`) in the declared runtime.

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

For a caller-owned OCI image layout directory, use `browser_runtime_oci` instead:

```starlark
load("@rules_web_e2e//playwright:archive.bzl", "browser_runtime_oci")

browser_runtime_oci(
    name = "runtime_files",
    image = ":caller_image",
    directory = "runtime",
)
```

`image` supplies one declared OCI layout directory, such as an `oci_image`
output. `directory` selects the runtime subtree after applying layers; use `.`
when the whole image is a closed browser runtime. Keep the `browser_runtime`
paths relative to that selected subtree. OCI extraction verifies SHA-256 blob
digests and sizes, selects one Linux amd64 image, applies layers in order, and
handles whiteouts before same-layer additions. It supports uncompressed and
gzip layers; unsupported layer media types fail explicitly. It never fetches
missing blobs, executes image commands, or contacts a registry.

An image tar produced by `docker save` or `oci_load` is neither a flattened
filesystem archive nor a layout directory. Pass the image layout target directly.
The runtime subtree must include every link target it needs within the declared
image, and must not rely on Docker injecting files such as `/etc/hosts`.

Execution currently requires a patched actiond Linux amd64 worker. The remote
actions produce comparison/capture results; the local test command reports their
status and `.update` applies successful captures. Host E2E/component-browser
targets continue to use their existing browser setup. Native and component
capture/comparison through the public rules passed the Linux VM workflow.

VRT inputs are configured for Linux amd64 even when the Bazel client runs on
macOS. A caller with additional native toolchain constraints can set
`target_platform = "//platforms:linux_x86_64_gnu"` on its visual target. That
platform must still target Linux amd64 and match the runtime's ABI. `data` and
`$(rootpath ...)` expressions in `env` are evaluated in this configuration,
including expressions nested inside JSON strings used by fixture servers.
