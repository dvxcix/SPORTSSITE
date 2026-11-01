import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.slipsurge.com/dugout' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const bundle = await build({
  stdin: { contents: 'export { useDugoutColumnState } from "./src/components/dugout/useDugoutColumnState"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react'], tsconfig: 'tsconfig.json',
})
type Prefs = { hiddenColumns: string[] } | null
const compiled = { exports: {} as { useDugoutColumnState: (id: string | null, profile: string | null, stored: Prefs) => { prefs: Prefs; open: boolean; setOpen: (value: boolean) => void } } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)
const { useDugoutColumnState } = compiled.exports
function Board({ userId, profileId, stored }: { userId: string; profileId: string | null; stored: Prefs }) {
  const state = useDugoutColumnState(userId, profileId, stored)
  return createElement('div', null,
    createElement('span', { 'data-testid': 'prefs' }, state.prefs?.hiddenColumns.join(',') ?? 'default'),
    state.open && createElement('div', { 'data-testid': 'editor' }, 'Editor'),
    createElement('button', { onClick: () => state.setOpen(true) }, 'Open'),
  )
}

test('switching from account A to account B with null prefs clears A and closes its editor', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const first = { hiddenColumns: ['account-a'] }
  try {
    await act(async () => { root.render(createElement(Board as ComponentType<{ userId: string; profileId: string | null; stored: Prefs }>, { userId: 'a', profileId: 'a', stored: first })) })
    assert.equal(host.querySelector('[data-testid="prefs"]')?.textContent, 'account-a')
    await act(async () => { host.querySelector<HTMLButtonElement>('button')!.click() })
    assert.ok(host.querySelector('[data-testid="editor"]'))
    // The auth identity may change before its matching profile arrives.
    await act(async () => { root.render(createElement(Board as ComponentType<{ userId: string; profileId: string | null; stored: Prefs }>, { userId: 'b', profileId: 'a', stored: first })) })
    assert.equal(host.querySelector('[data-testid="prefs"]')?.textContent, 'default')
    assert.equal(host.querySelector('[data-testid="editor"]'), null)
    await act(async () => { root.render(createElement(Board as ComponentType<{ userId: string; profileId: string | null; stored: Prefs }>, { userId: 'b', profileId: 'b', stored: null })) })
    assert.equal(host.querySelector('[data-testid="prefs"]')?.textContent, 'default')
    assert.equal(host.querySelector('[data-testid="editor"]'), null)
  } finally { await act(async () => root.unmount()); host.remove() }
})
