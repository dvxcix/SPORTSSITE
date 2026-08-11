const WHOP_ROOT_HOST = 'whop.com'

export function isTrustedWhopUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false

  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.port
      && (hostname === WHOP_ROOT_HOST || hostname.endsWith(`.${WHOP_ROOT_HOST}`))
  } catch {
    return false
  }
}

export function isTrustedSlipSurgeUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false

  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.port
      && (hostname === 'slipsurge.com' || hostname === 'www.slipsurge.com')
  } catch {
    return false
  }
}
