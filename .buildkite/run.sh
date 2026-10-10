#!/usr/bin/env bash
set -euo pipefail
source .buildkite/setup.sh

case "${1:-}" in
  test)
    bazelisk build //...
    bazelisk test //... //tests/process:owned_test //tests/process:without_config_test //tests/process:timeout_contract_test
    (cd bcr_test
    bazelisk build @rules_web_e2e//:distribution //...
    bazelisk test //...
    
    )
    if [[ "$RUNNER_OS" == Linux ]]; then
    (cd examples/preset
    bazelisk test //... --test_output=errors
    )
    fi
    ;;
  host-browser)
    export PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers"
    install_node
    export DOCKER_HOST=tcp://127.0.0.1:1
    version=$(node -p 'require("./package.json").devDependencies.playwright')
    if [[ "$RUNNER_OS" == Linux ]]; then
      sudo apt-get update
      sudo apt-get install -y libgtk-3-0
    fi
    npx --yes "playwright@$version" install --with-deps chromium
    
    export E2E_TEST_ARTIFACTS="$RUNNER_TEMP/process-owned-results"
    if [ "$RUNNER_OS" = Linux ]; then
      xvfb-run -a node e2e-tests/process-owned.ts
    else
      node e2e-tests/process-owned.ts
    fi
    
    (cd examples/react
    bazelisk test //:host_e2e_test //:host_component_test //:remote_integration_test //:host_native_config_test --test_output=errors
    )
    if [[ "$RUNNER_OS" == Linux ]]; then
    (cd examples/react
    bazelisk test --nocache_test_results //:host_visual_test --test_output=errors
    bazelisk run //:host_component_visual_test.update
    bazelisk test --nocache_test_results //:host_component_visual_test --test_output=errors
    
    )
    fi
    export E2E_TEST_ARTIFACTS="$RUNNER_TEMP/isolated-e2e-results"
    node e2e-tests/run.ts
    bazelisk test //runtime:capture_browser_test --test_output=errors
    node e2e-tests/snapshot-updates.ts
    node e2e-tests/cacheable.ts
    node e2e-tests/lingering.ts
    node e2e-tests/temp-paths.ts
    ;;
  actiond)
    install_node
    sudo apt-get update
    sudo apt-get install -y kmod udev
    test -c /dev/kvm
    if [[ ! -e /dev/vhost-vsock ]]; then sudo modprobe vhost_vsock; fi
    test -c /dev/vhost-vsock
    # Keep access across device events between supervisor invocations.
    printf 'KERNEL=="kvm", MODE="0666"\nKERNEL=="vhost-vsock", MODE="0666"\n' | sudo tee /etc/udev/rules.d/99-actiond-ci.rules
    sudo udevadm control --reload-rules
    sudo udevadm settle
    sudo chmod a+rw /dev/kvm /dev/vhost-vsock
    test -r /dev/vhost-vsock && test -w /dev/vhost-vsock
    export USE_BAZEL_VERSION=9.2.0
    work="$RUNNER_TEMP/actiond-production"
    ACTIOND_SKIP_WORKER_SOURCE=1 bash e2e-tests/actiond/prepare.sh "$work"
    node e2e-tests/run.ts prepare "$work"
    
    work="$RUNNER_TEMP/actiond-production"
    bazelisk run --script_path="$work/run-web-e2e" //worker:runner
    
    export ACTIOND_BAZEL=bazelisk
    work="$RUNNER_TEMP/actiond-production"
    "$work/run-web-e2e" --log-dir="$work/supervisor" exec -- node e2e-tests/vm.ts "$work"
    
    work="$RUNNER_TEMP/actiond-production"
    "$work/run-web-e2e" --log-dir="$work/supervisor" --memory-mib=8192 --cas-image-size-mib=8192 exec -- node e2e-tests/capacity.ts "$work"
    
    (cd examples/react
    mkdir -p .web-e2e
    bazelisk run --script_path="$PWD/.web-e2e/run" @rules_web_e2e//worker:runner
    .web-e2e/run --bazel=bazelisk doctor
    .web-e2e/run --bazel=bazelisk test //:e2e_test //:component_test //:native_config_test //:visual_test //:component_visual_test //:native_visual_test
    
    )
    ;;
  macos-vrt)
    install_node
    bash e2e-tests/actiond/run-macos-arm64.sh "$RUNNER_TEMP/actiond-macos" --build-only
    ;;
  *) echo 'Unknown CI suite' >&2; exit 1 ;;
esac
