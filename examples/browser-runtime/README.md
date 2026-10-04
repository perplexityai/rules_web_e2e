# Declared Linux Chromium runtime

`BUILD.bazel` uses public `linux_chromium_runtime` helper. `MODULE.bazel`
selects checksum-pinned Chromium and Node archives; default versioned preset
supplies Linux libraries, Bash, shell utilities and fonts.

```sh
bazelisk build //:browser
```

Target supplies both declared directory and `BrowserRuntimeInfo`, so
consumer can pass it directly as `browser = ":browser"` on visual tests. See
[the runtime guide](../../docs/browser-runtime.md) for custom fonts, system
presets, exporting files for React example, and version compatibility.

For Linux ARM64 inputs, build `//:browser_arm64`. Both browser and Node downloads
 pinned to same versions as amd64 example. This target assembles files
on host; running VRT requires matching worker. See
[local Apple Silicon VRT](../../docs/macos-arm64-vrt.md).
