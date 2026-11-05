export type NbaFirstEventFailure = 'missing-key' | 'authorization' | 'quota' | 'upstream' | 'transport' | 'unknown'

export class NbaFirstOddsUnavailable extends Error {
  constructor(public reason: 'connection' | 'authorization' | 'quota' | 'upstream') {
    super('First-basket odds unavailable')
  }
}

export class NbaFirstEventTransportError extends Error {
  constructor() { super('Event request failed') }
}

export async function nbaReadFirstOddsResponse<T>(load: () => Promise<Response>, classifyEventTransport = false): Promise<T> {
  let response: Response
  try { response = await load() }
  catch (error) { if (classifyEventTransport) throw new NbaFirstEventTransportError(); throw error }
  if (!response.ok) throw new NbaFirstOddsUnavailable(response.status === 401 || response.status === 403 ? 'authorization' : response.status === 429 ? 'quota' : 'upstream')
  return response.json() as Promise<T>
}

/** Never serialize the original exception: it may contain a credential-bearing URL. */
export function nbaFirstEventFailure(error: unknown): NbaFirstEventFailure {
  if (error instanceof NbaFirstEventTransportError) return 'transport'
  if (!(error instanceof NbaFirstOddsUnavailable)) return 'unknown'
  switch (error.reason) {
    case 'connection': return 'missing-key'
    case 'authorization': return 'authorization'
    case 'quota': return 'quota'
    case 'upstream': return 'upstream'
    default: return 'unknown'
  }
}

export function nbaFirstEventFailureLog(error: unknown): string {
  return `NBA market event list unavailable: ${nbaFirstEventFailure(error)}`
}
