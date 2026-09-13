"""A reusable, version-matched Playwright runtime."""

PLAYWRIGHT_IMAGE = "mcr.microsoft.com/playwright:v1.63.0-noble@sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7"

REAPER_IMAGE = "testcontainers/ryuk:0.14.0@sha256:f0456560ea5b4acdbed0da0efc33b5f9dd6bc1e59f2337106826dcb5b0b0e981"

PlaywrightInfo = provider(fields = ["test", "core", "version", "image", "images"])

def _images(image):
    return [
        {"image": image, "platform": "linux/amd64", "roles": ["browser", "control-relay"]},
        {"image": REAPER_IMAGE, "platform": None, "roles": ["reaper"]},
    ]

def runfile(file):
    """Return a canonical manifest-relative path, including external repositories."""
    return file.short_path[3:] if file.short_path.startswith("../") else "_main/" + file.short_path

def _runtime_impl(ctx):
    parts = ctx.attr.version.split(".")
    if len(parts) != 3 or any([not p.isdigit() for p in parts]):
        fail("Playwright version must be a stable major.minor.patch version >= 1.63.0")
    if (int(parts[0]), int(parts[1]), int(parts[2])) < (1, 63, 0):
        fail("Playwright >= 1.63.0 is required")
    image = ctx.attr.image or (PLAYWRIGHT_IMAGE if ctx.attr.version == "1.63.0" else "")
    if image and "@sha256:" not in image:
        fail("Browser images must be digest-pinned")
    files = ctx.files.test + ctx.files.core
    runfiles = ctx.runfiles(files = files)
    for target in [ctx.attr.test, ctx.attr.core]:
        runfiles = runfiles.merge(target[DefaultInfo].default_runfiles)
    return [
        DefaultInfo(files = depset(files), runfiles = runfiles),
        PlaywrightInfo(test = runfile(ctx.file.test), core = runfile(ctx.file.core), version = ctx.attr.version, image = image, images = _images(image) if image else []),
    ]

playwright_runtime = rule(
    implementation = _runtime_impl,
    attrs = {
        "test": attr.label(mandatory = True, allow_single_file = True),
        "core": attr.label(mandatory = True, allow_single_file = True),
        "version": attr.string(default = "1.63.0"),
        "image": attr.string(),
    },
)

def _images_impl(ctx):
    if not ctx.attr.playwright[PlaywrightInfo].images:
        fail("Image manifests require a matching digest-pinned VRT browser image")
    manifest = ctx.actions.declare_file(ctx.label.name + ".json")
    ctx.actions.write(manifest, json.encode({
        "schemaVersion": 1,
        "images": ctx.attr.playwright[PlaywrightInfo].images,
    }) + "\n")
    return [DefaultInfo(files = depset([manifest]))]

playwright_images = rule(
    implementation = _images_impl,
    doc = "Docker-free image requirements for CI preloading; null platform means daemon-selected.",
    attrs = {
        "playwright": attr.label(mandatory = True, providers = [PlaywrightInfo]),
    },
)
