"""Managed-server Playwright end-to-end tests."""

load("//internal:browser.bzl", "browser_test")

def web_e2e_test(name, **kwargs):
    """Run native Playwright specs; see docs/e2e.md for the execution contract."""
    for key in ["visual", "baselines", "baseline_dir"]:
        if key in kwargs:
            fail("%s is not an E2E option" % key)
    browser_test(name = name, visual = False, **kwargs)
