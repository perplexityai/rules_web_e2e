"""Check analysis-time browser paths and bundle boundaries."""

load("@bazel_skylib//lib:unittest.bzl", "asserts", "unittest")
load(":layout.bzl", "browser_input", "linux_layout")

def _file(path, directory = False):
    parts = path.split("/")
    return struct(path = path, dirname = "/".join(parts[:-1]), basename = parts[-1], is_directory = directory)

def _files_impl(ctx):
    env = unittest.begin(ctx)
    browser = browser_input([
        _file("external/chrome/bundle/icudtl.dat"),
        _file("external/chrome/bundle/chrome-headless-shell"),
        _file("external/chrome/bundle/resources/pak"),
        _file("external/chrome/bundle-other/not-part-of-browser"),
    ], "chrome-headless-shell")
    asserts.equals(env, "external/chrome/bundle/chrome-headless-shell", browser.executable)
    asserts.equals(env, ["icudtl.dat", "chrome-headless-shell", "resources/pak"], [file["destination"] for file in browser.files])
    selected = browser_input([
        _file("external/chrome/one/chrome-headless-shell"),
        _file("external/chrome/two/chrome-headless-shell"),
    ], "two/chrome-headless-shell")
    asserts.equals(env, "external/chrome/two/chrome-headless-shell", selected.executable)
    root_bundle = browser_input([_file("chrome-headless-shell"), _file("icudtl.dat")], "chrome-headless-shell")
    asserts.equals(env, ["chrome-headless-shell", "icudtl.dat"], [file["destination"] for file in root_bundle.files])
    return unittest.end(env)

def _directory_impl(ctx):
    env = unittest.begin(ctx)
    browser = browser_input([_file("bazel-out/browser", True)], "nested/chrome-headless-shell")
    asserts.equals(env, "bazel-out/browser/nested/chrome-headless-shell", browser.executable)
    asserts.equals(env, [{"source": "bazel-out/browser/nested", "destination": ""}], browser.files)
    plan = linux_layout(_file("system", True), _file("bin/node"), browser, "video/ffmpeg", [
        _file("fonts/brand.ttf"),
        _file("font-bundle", True),
    ])
    asserts.equals(env, ["", "chromium", "bin/node", "bin/ffmpeg-linux", "fonts/custom/0/brand.ttf", "fonts/custom/1"], [file["destination"] for file in plan.files])
    asserts.equals(env, ["bin/node", "bin/ffmpeg-linux"], plan.executables)
    no_video = linux_layout(_file("system", True), _file("bin/node"), browser, "", [])
    asserts.equals(env, ["bin/node"], no_video.executables)
    return unittest.end(env)

_files_test = unittest.make(_files_impl)
_directory_test = unittest.make(_directory_impl)

def layout_tests(name):
    unittest.suite(name, _files_test, _directory_test)
