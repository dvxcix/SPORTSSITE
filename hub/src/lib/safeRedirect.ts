const INTERNAL_ORIGIN = 'https://slipsurge.internal'

/**
 * Returns a normalized same-origin path. OAuth and login return targets are
 * user-controlled, so rejecting protocol-relative and backslash-normalized
 * URLs is required before they are passed to redirects or the client router.
 */
export function safeInternalPath(value: string | null | undefined, fallback = '/feed'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback

  try {
    const parsed = new URL(value, INTERNAL_ORIGIN)
    if (parsed.origin !== INTERNAL_ORIGIN) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
