import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://www.slipsurge.com/events/test' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const fixture = { fail: false, writes: [] as string[] }
const client = {
  from(table: string) {
    assert.equal(table, 'event_rsvps')
    return {
      async upsert(value: { status: string }) { fixture.writes.push(value.status); return { error: fixture.fail ? { message: 'unavailable' } : null } },
      delete() { return { async match() { fixture.writes.push('delete'); return { error: fixture.fail ? { message: 'unavailable' } : null } } } },
    }
  },
}
Object.assign(globalThis, { eventRsvpFixture: { client } })
const result = await build({
  entryPoints: ['src/components/events/EventRSVPButtons.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'rsvp-fixture', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: 'client', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const createClient=()=>globalThis.eventRsvpFixture.client', loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { EventRSVPButtons: ComponentType<{ userId: string; eventId: string; initialRsvp: string | null }> } }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, compiled, compiled.exports)

test('RSVP controls expose the selected status and restore it if a later change fails', async () => {
  const container = document.getElementById('root')!
  const root = createRoot(container)
  await act(async () => root.render(createElement(compiled.exports.EventRSVPButtons, { userId: 'viewer', eventId: 'event', initialRsvp: null })))
  const buttons = [...container.querySelectorAll('button')]
  assert.equal(buttons.length, 3)
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'false')
  await act(async () => buttons[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true')
  fixture.fail = true
  await act(async () => buttons[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true')
  assert.equal(buttons[1].getAttribute('aria-pressed'), 'false')
  fixture.fail = false
  await act(async () => buttons[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'false')
  assert.deepEqual(fixture.writes, ['going', 'interested', 'delete'])
  await act(async () => root.unmount())
})
