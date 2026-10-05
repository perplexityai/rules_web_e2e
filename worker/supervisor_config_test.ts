import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bazelConfig} from './supervisor.js'

test('public supervisor config preserves isolated execution in a consumer module', () => {
  const endpoint = 'grpc://127.0.0.1:18980'
  const lines = bazelConfig(endpoint).trim().split('\n')
  assert(lines.every(line => line.startsWith('build:web-e2e ')))
  const flags = lines.map(line => line.slice('build:web-e2e '.length))
  for (const flag of [`--remote_executor=${endpoint}`, `--remote_cache=${endpoint}`,
    '--remote_local_fallback=false', '--remote_download_outputs=all', '--strategy=VrtCapture=remote'])
    assert(flags.includes(flag))
  assert(!flags.some(flag => flag.startsWith('--remote_default_exec_properties')))
})
