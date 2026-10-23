/** A failed verification is not evidence that a member signed out. */
export function isRetryableAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { name?: string; code?: string; status?: number }
  return value.name === 'AuthTemporarilyUnavailableError'
    || value.name === 'AuthRetryableFetchError'
    || value.name === 'AuthUnknownError'
    || value.name === 'AbortError'
    || value.name === 'TimeoutError'
    || value.name === 'TypeError'
    || value.code === 'refresh_token_already_used'
    || value.code === 'refresh_token_not_found'
    || value.status === 0 || value.status === 408 || value.status === 429
    || (typeof value.status === 'number' && value.status >= 500)
}

export class AuthTemporarilyUnavailableError extends Error {
  readonly status = 503
  readonly code = 'AUTH_TEMPORARILY_UNAVAILABLE'
  constructor() {
    super('Account verification is temporarily unavailable. Please try again.')
    this.name = 'AuthTemporarilyUnavailableError'
  }
}

export const AUTH_UNAVAILABLE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Retry-After': '3',
}
