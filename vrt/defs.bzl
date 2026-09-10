"""Component visual tests with explicit baseline updates."""

load("//internal:browser.bzl", "browser_test", _PLAYWRIGHT_IMAGE = "PLAYWRIGHT_IMAGE")

PLAYWRIGHT_IMAGE = _PLAYWRIGHT_IMAGE

def component_visual_test(name, **kwargs):
    """See docs/component-vrt.md for source, server, and baseline arguments."""
    browser_test(name = name, visual = True, **kwargs)
