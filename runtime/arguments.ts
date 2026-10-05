import fs from 'node:fs'

/** Keep selection flags without allowing CLI overrides of managed paths/reporters. */
export function testArguments(
  visual: boolean,
  args: string[],
  files: string[] = [],
  env: NodeJS.ProcessEnv = {},
): string[] {
  const selection: string[] = []
  const updating = args.includes('--update') || args.includes('--export-snapshots')
  if (updating && (env.TESTBRIDGE_TEST_ONLY || env.TEST_TOTAL_SHARDS))
    throw new Error('Snapshot updates cannot be filtered or sharded by Bazel')
  if (env.TESTBRIDGE_TEST_ONLY) {
    if (args.some(arg => arg === '--grep' || arg.startsWith('--grep=')))
      throw new Error('Use either --test_filter or --grep, not both')
    selection.push('--grep', env.TESTBRIDGE_TEST_ONLY)
  }
  if (env.TEST_TOTAL_SHARDS !== undefined || env.TEST_SHARD_INDEX !== undefined) {
    const total = Number(env.TEST_TOTAL_SHARDS), index = Number(env.TEST_SHARD_INDEX)
    if (!Number.isSafeInteger(total) || total < 1 || !Number.isSafeInteger(index) || index < 0 || index >= total)
      throw new Error('Invalid Bazel test shard')
    if (args.some(arg => arg === '--shard' || arg.startsWith('--shard=')))
      throw new Error('Bazel owns test sharding; remove --shard')
    selection.push(`--shard=${index + 1}/${total}`)
    if (env.TEST_SHARD_STATUS_FILE) fs.writeFileSync(env.TEST_SHARD_STATUS_FILE, '')
  }
  if (visual) {
    if (args.some(arg => arg !== '--update'))
      throw new Error(
        'Filtered visual runs are unsupported: run the full target to preserve all baselines'
      )
    return selection
  }
  const result: string[] = [...selection]
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--export-snapshots') continue
    if (arg === '--pass-with-no-tests') {
      result.push(arg)
      continue
    }
    if (!arg.startsWith('-')) {
      const file = arg.replace(/\.spec\.tsx?$/, '.spec.js')
      if (
        !files.some(
          declared => declared === file || declared.endsWith('/' + file)
        )
      )
        throw new Error(`Spec selector is not a declared test input: ${arg}`)
      // Playwright filters both loaded modules and source-mapped test locations.
      result.push(
        file
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\\.js$/, '\\.(?:js|ts|tsx)') + '$'
      )
      continue
    }
    const flag = arg.split('=')[0]
    if (!['--grep', '--grep-invert', '--project', '--shard'].includes(flag))
      throw new Error(
        `Unsupported E2E argument: ${arg}; use --grep, --grep-invert, --project, or --shard`
      )
    result.push(arg)
    if (!arg.includes('=')) {
      const value = args[++index]
      if (!value || value.startsWith('--'))
        throw new Error(`Missing value for ${flag}`)
      result.push(value)
    } else if (!arg.slice(arg.indexOf('=') + 1))
      throw new Error(`Missing value for ${flag}`)
  }
  return result
}
