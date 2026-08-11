const EXACT_PUSH_HOSTS = new Set([
  'android.googleapis.com',
  'fcm.googleapis.com',
  'push.apple.com',
  'push.services.mozilla.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
])

const PUSH_HOST_SUFFIXES = [
  '.notify.windows.com',
  '.push.apple.com',
]

export function isTrustedPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 16 || value.length > 4096) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false
    const hostname = url.hostname.toLowerCase()
    return EXACT_PUSH_HOSTS.has(hostname) || PUSH_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))
  } catch {
    return false
  }
}

export function isValidPushKey(value: unknown, maxLength: number): value is string {
  return typeof value === 'string'
    && value.length >= 16
    && value.length <= maxLength
    && /^[A-Za-z0-9_-]+={0,2}$/.test(value)
}
