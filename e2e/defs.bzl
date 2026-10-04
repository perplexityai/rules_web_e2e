"""Managed-server Playwright end-to-end tests."""

load("//internal:browser.bzl", "browser_test")

def web_e2e_test(name, **kwargs):
    """Run native Playwright specs; see docs/e2e.md for the execution contract."""
    for key in ["visual", "component", "process_owned", "baselines", "baseline_dir"]:
        if key in kwargs:
            fail("%s is not an E2E option" % key)
    browser_test(name = name, visual = False, **kwargs)

def browser_process_test(name, **kwargs):
    """Run compiled Playwright specs that launch their own Electron/browser process."""
    for key in ["visual", "component", "process_owned", "baselines", "baseline_dir"]:
        if key in kwargs:
            fail("%s is not a process-owned test option" % key)
    browser_test(name = name, process_owned = True, **kwargs)
