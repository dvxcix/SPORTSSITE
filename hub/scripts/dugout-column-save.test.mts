import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, useState, type ComponentType } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.slipsurge.com/dugout' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const bundle = await build({
  stdin: { contents: 'export { useDugoutColumnSave } from "./src/components/dugout/useDugoutColumnSave"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react'], tsconfig: 'tsconfig.json',
})
const compiled = { exports: {} as { useDugoutColumnSave: (id: string | null, stored: { hiddenColumns: string[] } | null) => { saving: boolean; error: string; save: (next: { hiddenColumns: string[] }) => Promise<boolean> } } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)
const stored = { hiddenColumns: ['old'] }
const next = { hiddenColumns: ['new'] }
const { useDugoutColumnSave } = compiled.exports

function Editor({ userId }: { userId: string }) {
  const [board, setBoard] = useState(stored)
  const [open, setOpen] = useState(true)
  const { saving, error, save } = useDugoutColumnSave(userId, stored)
  return createElement('div', null,
    createElement('span', { 'data-testid': 'board' }, board.hiddenColumns.join(',')),
    open && createElement('div', { 'data-testid': 'editor' },
      error && createElement('p', { role: 'alert' }, error),
      createElement('button', { disabled: saving, onClick: async () => { if (await save(next)) { setBoard(next); setOpen(false) } } }, saving ? 'Saving…' : 'Save'),
    ),
  )
}

test('failed or uncertain column saves leave the board and editor intact and show an error', async () => {
  const originalFetch = globalThis.fetch
  let mode: 'conflict' | 'network' | 'success' = 'conflict'
  const requests: Array<Record<string, unknown>> = []
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    if (mode === 'network') throw new Error('network')
    return { ok: mode === 'success', status: mode === 'success' ? 200 : 409 } as Response
  }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(Editor as ComponentType<{ userId: string }>, { userId: 'owner' })) })
    const save = () => host.querySelector<HTMLButtonElement>('button')!
    await act(async () => { save().click(); await Promise.resolve() })
    assert.equal(host.querySelector('[data-testid="board"]')?.textContent, 'old')
    assert.ok(host.querySelector('[data-testid="editor"]'))
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? '', /Refresh/)
    mode = 'network'
    await act(async () => { save().click(); await Promise.resolve() })
    assert.equal(host.querySelector('[data-testid="board"]')?.textContent, 'old')
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? '', /Could not save/)
    mode = 'success'
    await act(async () => { save().click(); await Promise.resolve() })
    assert.equal(host.querySelector('[data-testid="board"]')?.textContent, 'new')
    assert.equal(host.querySelector('[data-testid="editor"]'), null)
    assert.deepEqual(requests.map(request => request.expected), [ { dugout_column_prefs: stored }, { dugout_column_prefs: stored }, { dugout_column_prefs: stored } ])
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
})

test('a pending save cannot apply to the board after the active account changes', async () => {
  const originalFetch = globalThis.fetch
  let finish!: (response: Response) => void
  globalThis.fetch = async () => new Promise<Response>(resolve => { finish = resolve })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(Editor as ComponentType<{ userId: string }>, { userId: 'first' })) })
    await act(async () => { host.querySelector<HTMLButtonElement>('button')!.click(); await Promise.resolve() })
    assert.equal(host.querySelector<HTMLButtonElement>('button')!.disabled, true)
    await act(async () => { root.render(createElement(Editor as ComponentType<{ userId: string }>, { userId: 'second' })) })
    await act(async () => { finish({ ok: true, status: 200 } as Response); await Promise.resolve() })
    assert.equal(host.querySelector('[data-testid="board"]')?.textContent, 'old')
    assert.ok(host.querySelector('[data-testid="editor"]'))
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
})
