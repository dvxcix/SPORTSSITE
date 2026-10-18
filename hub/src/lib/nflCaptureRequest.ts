import { get as httpsGet } from 'node:https'
import { get as httpGet } from 'node:http'

/** Keep the existing overall budget without fetch's shorter idle-header deadline. */
export function requestNflCapture(url: string, headers: Record<string, string>, timeoutMs: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    let phase = 'connecting'
    const get = new URL(url).protocol === 'https:' ? httpsGet : httpGet
    const request = get(url, { headers, signal: AbortSignal.timeout(timeoutMs) }, response => {
      phase = 'response'
      void (async () => {
        const chunks: Buffer[] = []
        let bytes = 0
        for await (const chunk of response) {
          bytes += chunk.length
          if (bytes > 1_000_000) throw new Error('Capture summary exceeded its response limit')
          chunks.push(Buffer.from(chunk))
        }
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode ?? 502 }))
      })().catch(reject)
    })
    request.on('socket', socket => {
      if (!socket.connecting) phase = 'waiting'
      socket.once('connect', () => { phase = 'connected' })
      socket.once('secureConnect', () => { phase = 'waiting' })
    })
    request.on('error', error => reject(Object.assign(error, { capturePhase: phase })))
  })
}
