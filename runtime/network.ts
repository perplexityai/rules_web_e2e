/** Turn explicit HTTP origins into exact Playwright tunnel host:port entries. */
export function networkTargets(fixture: string, origins: string[]): string {
  return [fixture, ...origins]
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
