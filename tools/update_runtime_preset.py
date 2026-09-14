"""Export the reviewed APT closure as immutable runtime package downloads."""
import json
from pathlib import Path
import sys


def export(lockfile, output):
    lock = json.loads(Path(lockfile).read_text())
    resolved = []
    for extension, configurations in lock['moduleExtensions'].items():
        if not extension.endswith('%apt'):
            continue
        for config in configurations.values():
            spec = config.get('generatedRepoSpecs', {}).get('vrt_noble')
            if spec:
                resolved.append(json.loads(spec['attributes']['lock_content']))
    if len(resolved) != 1:
        raise ValueError('Expected one vrt_noble APT resolution; run Bazel 9 mod deps in tools/runtime-preset')
    data = resolved[0]
    packages = {}
    for package in data['packages'].values():
        entry = {key: package[key] for key in ['name', 'version', 'sha256']}
        entry['urls'] = [uri + '/' + package['filename'] for uri in data['sources'][package['suite']]['uris']]
        if entry['name'] in packages and packages[entry['name']] != entry:
            raise ValueError(f"Conflicting versions of {entry['name']}; review the APT closure")
        packages[entry['name']] = entry
    Path(output).write_text(json.dumps({'packages': [packages[key] for key in sorted(packages)]}, indent=2) + '\n')


if __name__ == '__main__':
    export(*sys.argv[1:])
