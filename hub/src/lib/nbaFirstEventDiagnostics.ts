type ProviderRejection = 'invalid-key' | 'deactivated-key' | 'usage-exhausted' | 'request-key-missing'
export type NbaFirstEventFailure = 'missing-key' | 'authorization' | 'quota' | 'upstream' | 'transport' | 'unknown' | ProviderRejection

export class NbaFirstOddsUnavailable extends Error {
  constructor(public reason: 'connection' | 'authorization' | 'quota' | 'upstream', public rejection?: ProviderRejection) {
    super('First-basket odds unavailable')
  }
}

export class NbaFirstEventTransportError extends Error {
  constructor() { super('Event request failed') }
}

/** Read only a small, short-lived error body from the existing event request.
 * Never log the body: it can include a key or credential-bearing URL. */
async function providerRejection(response: Response): Promise<ProviderRejection | undefined> {
  const bytesLimit=4096,header=response.headers.get('content-length')
  if(header && /^\d+$/.test(header) && Number(header)>bytesLimit){
    try { void response.body?.cancel().catch(()=>{}) } catch {/* Diagnostic cleanup is best effort. */}
    return undefined
  }
  let reader:ReadableStreamDefaultReader<Uint8Array> | undefined
  try { reader=response.body?.getReader() } catch { return undefined }
  if(!reader)return undefined
  let timer:ReturnType<typeof setTimeout> | undefined
  const read=async():Promise<ProviderRejection | undefined>=>{
    const parts:Uint8Array[]=[];let bytes=0
    for(let count=0;count<32;count++){
      const chunk=await reader.read()
      if(chunk.done){
        const body=new Uint8Array(bytes);let offset=0
        for(const part of parts){body.set(part,offset);offset+=part.length}
        const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body)) as {error_code?:unknown}
        switch(value?.error_code){
          case 'INVALID_KEY':return 'invalid-key'
          case 'DEACTIVATED_KEY':return 'deactivated-key'
          case 'OUT_OF_USAGE_CREDITS':return 'usage-exhausted'
          case 'MISSING_KEY':return 'request-key-missing'
          default:return undefined
        }
      }
      if(!(chunk.value instanceof Uint8Array) || (bytes+=chunk.value.byteLength)>bytesLimit)return undefined
      parts.push(chunk.value)
    }
    return undefined
  }
  try {
    return await Promise.race([read(),new Promise<undefined>(resolve=>{timer=setTimeout(()=>resolve(undefined),250)})])
  } catch { return undefined }
  finally {
    if(timer)clearTimeout(timer)
    try { void reader.cancel().catch(()=>{}) } catch {/* Diagnostic cleanup is best effort. */}
  }
}

export async function nbaReadFirstOddsResponse<T>(load: () => Promise<Response>, classifyEventTransport = false): Promise<T> {
  let response: Response
  try { response = await load() }
  catch (error) { if (classifyEventTransport) throw new NbaFirstEventTransportError(); throw error }
  if (!response.ok) {
    const authorization=response.status===401||response.status===403
    const rejection=authorization&&classifyEventTransport?await providerRejection(response):undefined
    throw new NbaFirstOddsUnavailable(authorization?'authorization':response.status===429?'quota':'upstream',rejection)
  }
  return response.json() as Promise<T>
}

/** Never serialize the original exception: it may contain a credential-bearing URL. */
export function nbaFirstEventFailure(error: unknown): NbaFirstEventFailure {
  if (error instanceof NbaFirstEventTransportError) return 'transport'
  if (!(error instanceof NbaFirstOddsUnavailable)) return 'unknown'
  switch (error.reason) {
    case 'connection': return 'missing-key'
    case 'authorization':
      switch(error.rejection){
        case 'invalid-key':case 'deactivated-key':case 'usage-exhausted':case 'request-key-missing':return error.rejection
        default:return 'authorization'
      }
    case 'quota': return 'quota'
    case 'upstream': return 'upstream'
    default: return 'unknown'
  }
}

export function nbaFirstEventFailureLog(error: unknown): string {
  return `NBA market event list unavailable: ${nbaFirstEventFailure(error)}`
}
