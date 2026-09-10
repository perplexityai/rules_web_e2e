/** Keep selection flags without allowing CLI overrides of managed paths/reporters. */
export function testArguments(visual: boolean, args: string[]): string[] {
  if (visual) {
    if (args.some(arg => arg !== '--update'))
      throw new Error(
        'Filtered visual runs are unsupported: run the full target to preserve all baselines'
      )
    return []
  }
  const result: string[] = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
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
