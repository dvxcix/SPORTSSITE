/** Keep intermediaries active while returning the actual capture status in the envelope. */
export function streamNflCapture(run: () => Promise<Response>, intervalMs = 10_000): Response {
  const encoder = new TextEncoder()
  let active = true
  let timer: ReturnType<typeof setInterval> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => { if (active) controller.enqueue(encoder.encode(text)) }
      write(' ')
      timer = setInterval(() => write(' '), intervalMs)
      void (async () => {
        try {
          const response = await run()
          write(JSON.stringify({ status: response.status, body: await response.json() }))
        } catch {
          write(JSON.stringify({ status: 502, body: { error: 'NFL capture failed' } }))
        } finally {
          clearInterval(timer)
          if (active) { active = false; controller.close() }
        }
      })()
    },
    cancel() { active = false; clearInterval(timer) },
  })
  return new Response(stream, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}
