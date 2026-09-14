# Actiond runtime validation

[VM run 34781995883](https://github.com/perplexityai/rules_web_e2e/actions/runs/34781995883)
passes native/component capture and comparison through the public Bazel rules,
network isolation, failed/empty captures, screenshot diffs, and execution deadlines.
The worker uses the two isolated patches in `experiments/actiond`.

[CI run 34782772531](https://github.com/perplexityai/rules_web_e2e/actions/runs/34782772531)
passes Bazel 8.6 and 9.2 on Linux and macOS, including archive extraction and
host browser tests. Extraction canonicalizes temporary roots before checking
image links, covering macOS's symlinked temporary directories.

Native macOS VM execution and cross-architecture screenshot equivalence are not
covered. The backend-removal PR adds cancellation and caller Bazel server coverage.
