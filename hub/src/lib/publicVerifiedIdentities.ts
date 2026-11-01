/** Only these fields are intended for connected-account links on a profile.
 * Never serialize the raw provider object or any unrecognized properties. */
export function publicVerifiedIdentities(value: unknown): Record<string, { handle: string; profileUrl: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  const result: Record<string, { handle: string; profileUrl: string }> = {}
  for (const provider of ['discord', 'x', 'whop'] as const) {
    const entry = source[provider]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const candidate = entry as Record<string, unknown>
    if (typeof candidate.handle !== 'string' || typeof candidate.profileUrl !== 'string') continue
    const handle = candidate.handle.trim()
    if (!handle || handle.length > 100 || /[\u0000-\u001f\u007f]/.test(handle)) continue
    let url: URL
    try { url = new URL(candidate.profileUrl) } catch { continue }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) continue
    const valid = provider === 'discord'
      ? url.hostname === 'discord.com' && (url.pathname === '/' || /^\/users\/\d{17,20}\/?$/.test(url.pathname))
      : provider === 'x'
        ? url.hostname === 'x.com' && /^\/[A-Za-z0-9_]{1,15}\/?$/.test(url.pathname)
        : url.hostname === 'whop.com' && (url.pathname === '/' || /^\/@[A-Za-z0-9_.-]+\/?$/.test(url.pathname))
    if (valid) result[provider] = { handle, profileUrl: url.href }
  }
  return result
}
