"""Exercise public browser rules from a disposable, independent Bazel consumer."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

repository = Path(__file__).resolve().parents[1]
bazel = os.environ.get('BAZEL', 'bazelisk')
with tempfile.TemporaryDirectory(prefix='rules-web-e2e-') as directory:
    work = Path(directory)
    consumer = work / 'consumer'
    shutil.copytree(repository / 'e2e-tests/actiond/workspace', consumer,
        ignore=shutil.ignore_patterns('bazel-*', 'node_modules', 'MODULE.bazel.lock',
            'runtime.tar', '__actiond*', '.web-e2e'))
    module = consumer / 'MODULE.bazel'
    contents = module.read_text()
    assert contents.count('path = "../../.."') == 1, 'expected the checkout override'
    module.write_text(contents.replace('path = "../../.."', f'path = {json.dumps(str(repository))}'))
    command = [bazel, f'--output_base={work}/bazel']
    try:
        subprocess.run(command + ['test', '//:host_e2e_test', '//:host_component_test',
            '//:host_native_config_test', '--nocache_test_results', '--test_output=errors'],
            cwd=consumer, check=True, timeout=600)
    finally:
        # Preserve browser evidence and Bazel reports before disposing of the workspace.
        artifacts = os.environ.get('E2E_TEST_ARTIFACTS')
        if artifacts and (consumer / 'bazel-testlogs').exists():
            shutil.copytree(consumer / 'bazel-testlogs', artifacts, dirs_exist_ok=True)
        subprocess.run(command + ['shutdown'], cwd=consumer, timeout=60, check=False)
