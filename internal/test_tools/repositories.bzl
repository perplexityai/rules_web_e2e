"""Pinned BCR source overlays with local hermetic-build fixes."""

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

_BCR = "https://raw.githubusercontent.com/bazelbuild/bazel-central-registry/6371aa1bf1c7c3f385d6391a5f41a9d9dde3f9f8/modules"

def _sources_impl(_ctx):
    http_archive(
        name = "test_tools_toybox",
        urls = ["https://github.com/landley/toybox/archive/refs/tags/0.8.12.tar.gz"],
        integrity = "sha256-PFKdk5I93mfQSOe8vV0bwN0a0JNiJp4kFfXy6qs0m1s=",
        strip_prefix = "toybox-0.8.12",
        remote_file_urls = {
            "BUILD": [_BCR + "/toybox/0.8.12.bcr.1/overlay/BUILD"],
            "generated/config.h": [_BCR + "/toybox/0.8.12.bcr.1/overlay/generated/config.h"],
            "generated/flags.h": [_BCR + "/toybox/0.8.12.bcr.1/overlay/generated/flags.h"],
            "generated/globals.h": [_BCR + "/toybox/0.8.12.bcr.1/overlay/generated/globals.h"],
            "generated/help.h": [_BCR + "/toybox/0.8.12.bcr.1/overlay/generated/help.h"],
            "generated/newtoys.h": [_BCR + "/toybox/0.8.12.bcr.1/overlay/generated/newtoys.h"],
            "generated/tags.h": [_BCR + "/toybox/0.8.12.bcr.1/overlay/generated/tags.h"],
            "generated/zhelp.h": [_BCR + "/toybox/0.8.12.bcr.1/overlay/generated/zhelp.h"],
        },
        remote_file_integrity = {
            "BUILD": "sha256-m9Nq8lqEKwBo9dKxUYTRB4m1V5/0xqsI1kvxaBO1hLQ=",
            "generated/config.h": "sha256-rC1ADBHw3iemIEy4KSrjbvMh9jyO4VudxKQG75Li19w=",
            "generated/flags.h": "sha256-KmHBfs6RFPxNAjbJUbO4kcG57Pncr/JbBFCrFLkW2So=",
            "generated/globals.h": "sha256-XuIeFx7HIH+ZGOxQOE23Rc6KxBfNQVjW3JHNl6l4VyA=",
            "generated/help.h": "sha256-RTtynG4VvUiLJDMvcWzjqJo0U5Axc40X6EKqK7Onuvk=",
            "generated/newtoys.h": "sha256-TSABGcfOg4NzTa+1L34yV4Vy2jJkkwSzPNqtY/4dhmY=",
            "generated/tags.h": "sha256-ef75htyDDSTmt6hkfY3G5GpJ25qmLON3LCO1haaAWwA=",
            "generated/zhelp.h": "sha256-J5GcMw7Mj2cpaZiX2kjIizDoBn50je7AIGossY7kQ7g=",
        },
        patch_args = ["-p1"],
        patches = ["//internal/test_tools/patches:toybox.patch"],
    )
    http_archive(
        name = "test_tools_procps_ng",
        urls = ["https://gitlab.com/procps-ng/procps/-/archive/v4.0.5/procps-v4.0.5.tar.gz"],
        integrity = "sha256-LG1+2fKs3h1N1GAsYXL+Vu/4aVP+hjm9Yz29IswY9ds=",
        strip_prefix = "procps-v4.0.5",
        remote_file_urls = {
            "BUILD": [_BCR + "/procps-ng/4.0.5/overlay/BUILD"],
        },
        remote_file_integrity = {
            "BUILD": "sha256-g/zOMIvfZisLKcYxUGyco/iglnwU+Iz4vnXkvEKPw3g=",
        },
        patch_args = ["-p1"],
        patches = ["//internal/test_tools/patches:procps-ng.patch"],
    )
    http_archive(
        name = "test_tools_libmagic",
        urls = ["https://github.com/file/file/archive/refs/tags/FILE5_47.tar.gz"],
        integrity = "sha256-NU1t+k3eAvy8de/yvM+vCRCDejWHTFJLRv83TE+wR0I=",
        strip_prefix = "file-FILE5_47",
        remote_file_urls = {
            "BUILD.bazel": [_BCR + "/libmagic/5.47/overlay/BUILD.bazel"],
        },
        remote_file_integrity = {
            "BUILD.bazel": "sha256-Q3TX7LH9ciwlGvo4mePBrjbwErT2IJCpdPtbZhOkZMg=",
        },
        remote_patch_strip = 1,
        remote_patches = {
            _BCR + "/libmagic/5.47/patches/magic_mgc_from_runfiles.patch": "sha256-XQJ3bco1VDKYEss8mvrAraVIx5qbFO/eOkE6DdHB3DY=",
        },
        patch_args = ["-p1"],
        patches = ["//internal/test_tools/patches:libmagic.patch"],
    )
    return _ctx.extension_metadata(reproducible = True)

sources = module_extension(implementation = _sources_impl)
