import test from 'node:test'
import assert from 'node:assert/strict'
import { streamNflCapture } from '../src/lib/nflCaptureStream.ts'

test('capture stream emits heartbeats before the final failure status', async () => {
  let finish!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { finish = resolve })
  const reader = streamNflCapture(() => pending, 5).body!.getReader()
  const decoder = new TextDecoder()
  assert.equal(decoder.decode((await reader.read()).value), ' ')
  assert.equal(decoder.decode((await reader.read()).value), ' ')
  finish(Response.json({ incomplete: true }, { status: 425 }))
  let text = ''
  for (;;) { const chunk = await reader.read(); if (chunk.done) break; text += decoder.decode(chunk.value) }
  assert.deepEqual(JSON.parse(text), { status: 425, body: { incomplete: true } })
})

test('capture stream reports thrown errors as failure without leaking details', async () => {
  const response = streamNflCapture(async () => { throw new Error('private detail') }, 5)
  assert.deepEqual(await response.json(), { status: 502, body: { error: 'NFL capture failed' } })
})

test('disconnect does not launch another capture or interrupt its cleanup', async () => {
  let calls = 0
  let finish!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { finish = resolve })
  const reader = streamNflCapture(() => { calls++; return pending }, 5).body!.getReader()
  await reader.cancel()
  finish(Response.json({ ok: true }))
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(calls, 1)
})
