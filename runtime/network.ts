/** Turn explicit HTTP origins into exact Playwright tunnel host:port entries. */
export function networkTargets(fixture: string, origins: string[]): string {
  return [new URL(fixture).origin, ...origins]
    .map(origin => {
      const url = new URL(origin)
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        /[*,]/.test(url.hostname)
      )
        throw new Error(
          `Expected an HTTP(S) origin without credentials or wildcards: ${origin}`
        )
      return `${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`
    })
    .join(',')
}

/** Select an explicitly declared existing endpoint without starting a server. */
export function remoteAppUrl(env: NodeJS.ProcessEnv): string | undefined {
  const variable = env.VRT_BASE_URL_ENV || undefined
  if (env.VRT_BASE_URL === '' && env.VRT_BASE_URL_ENV === '') return undefined
  if (env.VRT_BASE_URL === undefined && variable === undefined) return undefined
  if (env.VRT_BASE_URL && variable !== undefined)
    throw new Error('Specify only one remote application URL source')
  const value = variable === undefined ? env.VRT_BASE_URL : env[variable]
  if (!value) throw new Error('The configured remote application URL is empty')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Remote application URL must be an absolute HTTP(S) URL')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    /[*,]/.test(url.hostname)
  )
    throw new Error(
      'Remote application URL must use HTTP(S), without credentials, fragments, or wildcards'
    )
  return url.href
}
