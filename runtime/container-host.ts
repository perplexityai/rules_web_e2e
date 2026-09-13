/** Prevent Testcontainers' conditional, unpinned Alpine gateway probe. */
export function containerHostOverride(
  inContainer: boolean,
  dockerHost: string | undefined,
  hasProperties: boolean
): string | undefined {
  // Testcontainers only uses the gateway probe when /.dockerenv exists.
  if (!inContainer) return undefined
  if (hasProperties)
    throw new Error(
      'Containerized browser runners do not support .testcontainers.properties; ' +
        'configure the remote daemon with DOCKER_HOST and DOCKER_TLS_VERIFY/DOCKER_CERT_PATH'
    )
  const url = dockerHost ? new URL(dockerHost) : undefined
  if (!url || !['tcp:', 'http:', 'https:'].includes(url.protocol) || !url.hostname)
    throw new Error(
      'Containerized browser runners require an explicit TCP/HTTP(S) DOCKER_HOST; ' +
        'socket/gateway discovery can require images outside the runtime manifest'
    )
  // Also suppress gateway discovery if Testcontainers tries a socket fallback.
  return url.hostname.replace(/^\[|\]$/g, '')
}
