# Actiond migration

Actiond replaced Testcontainers, Ryuk, image manifests, relay services, and preload
jobs. Browser/client packages, fixtures, and baselines remain caller-owned.

## Caller changes

- Select a [browser preset or custom runtime](browser-runtime.md) with `browser`.
- Use the [worker supervisor](worker-preset.md) or [manual setup](actiond.md).
- Preserve compiled specs/configs, built shells, matching, data, and baseline names.
- Declare fixture services and explicit environment values; origin exceptions
  and inherited environment are unsupported with declared browsers.
- Set `target_platform` for Linux ABI constraints and `worker_sha256` for custom workers.
- Remove Docker preparation and network/image tags from the isolated lane.

Actiond supplies pinned glibc 2.39/Bash; caller artifacts execute unchanged.
Host tests still support deployed services. Local Linux namespaces and controlled
host VRT are separate [execution choices](api.md#execution-modes).

## Validation scope

[Production KVM CI](../.github/workflows/actiond-production.yaml) exercises public
rules, isolation, failure artifacts, deadlines, retries, cancellation, and baseline
protection. [Apple Silicon evidence](macos-arm64-vrt.md) records local ARM64 VRT;
Buildkite cross-build/artifact smoke does not boot the macOS VM.

Cross-architecture pixel equivalence and full AGI/FormatJS CI migrations are not
established by repository checks. See [consumer migration](host-browsers.md#consumer-migration).
