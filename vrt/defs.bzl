"""Component visual tests with explicit baseline updates."""

load("//internal:browser.bzl", "browser_test", _PLAYWRIGHT_IMAGE = "PLAYWRIGHT_IMAGE")

PLAYWRIGHT_IMAGE = _PLAYWRIGHT_IMAGE

def component_visual_test(name, **kwargs):
    """See docs/component-vrt.md for built shell, matching, and baseline arguments."""
    for key in ["visual", "component", "tests"]:
        if key in kwargs:
            fail("%s is not a visual test option" % key)
    browser_test(name = name, visual = True, **kwargs)
