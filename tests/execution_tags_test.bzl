"""Verify cache policy on targets expanded through the public host macros."""

load("@bazel_skylib//lib:unittest.bzl", "asserts", "unittest")
load("//component:defs.bzl", "component_browser_test")
load("//e2e:defs.bzl", "web_e2e_test")

def _selection_policy_test_impl(ctx):
    env = unittest.begin(ctx)
    caller_controlled = ["manual", "requires-network", "no-sandbox", "external", "no-cache", "no-remote-cache", "no-remote"]
    for tag in caller_controlled:
        asserts.equals(env, [value for value in ctx.attr.caller_tags if value == tag], [value for value in ctx.attr.observed_tags if value == tag], "Only the caller may add " + tag)
    for tag in ctx.attr.caller_tags:
        asserts.true(env, tag in ctx.attr.observed_tags)
    return unittest.end(env)

_selection_policy_test = unittest.make(
    _selection_policy_test_impl,
    attrs = {"observed_tags": attr.string_list(), "caller_tags": attr.string_list()},
)

def selection_policy_test(name, target, caller_tags = []):
    _selection_policy_test(
        name = name,
        observed_tags = native.existing_rule(target)["tags"],
        caller_tags = caller_tags,
    )

def _cache_policy_test_impl(ctx):
    env = unittest.begin(ctx)
    for tag in ["no-remote-exec", ctx.attr.mode_tag, "consumer-tag"]:
        asserts.true(env, tag in ctx.attr.observed_tags, "Missing execution constraint: " + tag)
    for tag in ["no-sandbox", "requires-network"]:
        asserts.equals(env, ctx.attr.restricted, tag in ctx.attr.observed_tags, "Only the caller may add " + tag)
    asserts.equals(env, ["manual"], [tag for tag in ctx.attr.observed_tags if tag == "manual"], "Only the caller may add manual")
    for tag in ["external", "no-cache", "no-remote-cache", "no-remote"]:
        asserts.equals(env, tag in ctx.attr.caller_tags, tag in ctx.attr.observed_tags, "Only the caller may add " + tag)
    asserts.equals(env, [], ctx.attr.inherited_env)
    return unittest.end(env)

_cache_policy_test = unittest.make(
    _cache_policy_test_impl,
    attrs = {
        "observed_tags": attr.string_list(),
        "inherited_env": attr.string_list(),
        "mode_tag": attr.string(),
        "caller_tags": attr.string_list(),
        "restricted": attr.bool(),
    },
)

def execution_tags_tests():
    # Only inspect macro expansion; these inputs never launch a browser.
    native.genrule(
        name = "cache_policy_inputs",
        outs = ["policy.spec.js", "policy.browser.spec.js", "policy.config.js"],
        cmd = "touch $(OUTS)",
    )
    for mode, macro in [("e2e", web_e2e_test), ("component_browser", component_browser_test)]:
        for policy in ["default", "no-cache", "no-remote-cache", "no-remote", "external", "restricted"]:
            name = mode + "_" + policy
            tags = ["consumer-tag", "manual"] + (["requires-network", "no-sandbox"] if policy == "restricted" else [] if policy == "default" else [policy])
            macro(
                name = name,
                tests = ":cache_policy_inputs",
                config = ":policy.config.js",
                env = {"PLAYWRIGHT_BROWSERS_PATH": "/declared-browser-fixture"},
                tags = tags,
            )
            expanded = native.existing_rule(name)
            _cache_policy_test(
                name = name + "_policy_test",
                observed_tags = expanded["tags"],
                inherited_env = expanded["env_inherit"],
                mode_tag = mode + "_test",
                caller_tags = tags,
                restricted = policy == "restricted",
            )
