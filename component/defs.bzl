"""Native Playwright component browser tests."""

load("//internal:browser.bzl", "browser_test", _browser_shell = "browser_shell")

def component_browser_test(name, **kwargs):
    """Run native mount specs against a consumer gallery; see docs/component-browser.md."""
    for key in ["visual", "component", "baselines", "baseline_dir"]:
        if key in kwargs:
            fail("%s is not a component browser option" % key)
    browser_test(name = name, component = True, **kwargs)

browser_shell = _browser_shell
