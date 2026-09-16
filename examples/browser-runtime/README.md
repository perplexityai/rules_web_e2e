# Declared Linux Chromium runtime

`BUILD.bazel` uses the public `linux_chromium_runtime` helper. `MODULE.bazel`
selects checksum-pinned Chromium and Node archives; the default versioned preset
supplies Linux libraries, Bash, shell utilities and fonts.

```sh
bazelisk build //:browser
```

The target supplies both a declared directory and `BrowserRuntimeInfo`, so a
consumer can pass it directly as `browser = ":browser"` on visual tests. See
[the runtime guide](../../docs/browser-runtime.md) for custom fonts, system
presets, exporting files for the React example, and version compatibility.

For Linux ARM64 inputs, build `//:browser_arm64`. Both browser and Node downloads
are pinned to the same versions as the amd64 example. This target assembles files
on the host; running VRT requires a matching worker. See
[local Apple Silicon VRT](../../docs/macos-arm64-vrt.md).
