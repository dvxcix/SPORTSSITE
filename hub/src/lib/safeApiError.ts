import { NextResponse } from 'next/server'

type ErrorLike = {
  code?: unknown
  name?: unknown
  status?: unknown
}

export function safeErrorMetadata(cause: unknown): Record<string, string | number> {
  if (!cause || typeof cause !== 'object') return { type: typeof cause }
  const error = cause as ErrorLike
  const metadata: Record<string, string | number> = {}
  if (typeof error.code === 'string') metadata.code = error.code.slice(0, 80)
  if (typeof error.name === 'string') metadata.name = error.name.slice(0, 80)
  if (typeof error.status === 'number') metadata.status = error.status
  return metadata
}

/** Log enough to diagnose a server failure without returning provider or SQL details to clients. */
export function safeApiError(
  scope: string,
  cause: unknown,
  publicMessage = 'Request failed. Please try again.',
  status = 500,
) {
  console.error(`[${scope}] request failed`, safeErrorMetadata(cause))
  return NextResponse.json({ error: publicMessage }, { status })
}
