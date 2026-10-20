import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType, type ReactNode } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.slipsurge.com' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const stubs: Record<string, string> = {
  '@/lib/nbaRefresh': 'export const watchNbaRefresh=refresh=>{window.addEventListener("fixture:matrix-poll",refresh);return()=>window.removeEventListener("fixture:matrix-poll",refresh)}',
  'next/navigation': 'export const useRouter=()=>({push:()=>{}})',
}
const bundle = await build({
  stdin: { contents: 'export {NbaMatrixProvider,NbaMatrixResults} from "./src/components/nba/NbaMatrixContext"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, outfile: 'nba-matrix-refresh.cjs', platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom'], tsconfig: 'tsconfig.json', loader: { '.css': 'empty' },
  plugins: [{ name: 'matrix-refresh-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: resolve('.') }))
  } }],
})
const fixture = { exports: {} as Record<string, ComponentType<Record<string, unknown> & { children?: ReactNode }>> }
new Function('require', 'module', 'exports', bundle.outputFiles.find(file => file.path.endsWith('.cjs'))!.text)(require, fixture, fixture.exports)

type Pending = { gameId: number; signal: AbortSignal; finish: () => void }
async function harness(gameIds: number[]) {
  const originalFetch = globalThis.fetch, pending: Pending[] = []
  globalThis.fetch = (async (url, options) => {
    const gameId = Number(new URL(String(url), 'https://www.slipsurge.com').searchParams.get('game'))
    const signal = options!.signal as AbortSignal
    return new Promise<Response>((resolve, reject) => {
      const abort = () => reject(new DOMException('Fixture aborted', 'AbortError'))
      if (signal.aborted) { abort(); return }
      signal.addEventListener('abort', abort, { once: true })
      pending.push({ gameId, signal, finish: () => {
        signal.removeEventListener('abort', abort)
        resolve(Response.json({
          gameId, matrices: [{ id: 'matrix' }],
          matches: [{ id: 'matrix', name: 'Enabled matrix', color: '#22c55e', playerIds: [gameId * 10], missing: 0 }],
          players: [{ id: gameId * 10, name: `Player ${gameId}`, gameId, team: 'BOS' }],
        }))
      } })
    })
  }) as typeof fetch
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), board = { game: { id: gameIds[0], date: '2026-10-20' } }
  await act(async () => root.render(createElement(fixture.exports.NbaMatrixProvider, { board, gameIds },
    createElement(fixture.exports.NbaMatrixResults, { board, open: () => {} }))))
  return {
    host, pending,
    dispatch: async (name: string) => { await act(async () => window.dispatchEvent(new dom.window.Event(name))) },
    finish: async (...requests: Pending[]) => { await act(async () => { requests.forEach(request => request.finish()) }) },
    close: async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch },
  }
}

test('scheduled polls let a slow full-slate evaluation finish across multiple polling intervals', async () => {
  const ui = await harness([1, 2, 3, 4, 5])
  try {
    assert.deepEqual(ui.pending.map(request => request.gameId), [1])
    await ui.dispatch('fixture:matrix-poll')
    await ui.dispatch('fixture:matrix-poll')
    assert.equal(ui.pending.length, 1, 'polling must not restart the slow first game')
    assert.equal(ui.pending[0].signal.aborted, false)
    await ui.finish(ui.pending[0])
    assert.deepEqual(ui.pending.map(request => request.gameId), [1, 2, 3, 4])
    await ui.dispatch('fixture:matrix-poll')
    assert.ok(ui.pending.every(request => !request.signal.aborted))
    await ui.finish(...ui.pending.slice(1, 4))
    assert.equal(ui.pending[4].gameId, 5)
    await ui.dispatch('fixture:matrix-poll')
    assert.equal(ui.pending.length, 5, 'polling must not restart a partially completed slate')
    await ui.finish(ui.pending[4])
    assert.ok(ui.host.textContent?.includes('5 matches'))
    for (let id = 1; id <= 5; id++) assert.ok(ui.host.textContent?.includes(`Player ${id}`))
    await ui.dispatch('fixture:matrix-poll')
    assert.equal(ui.pending.length, 6, 'normal polling resumes after completion')
  } finally { await ui.close() }
})

test('an explicit matrix edit replaces in-flight results and remains protected from scheduled polling', async () => {
  const ui = await harness([1])
  try {
    await ui.dispatch('ss:nba-matrices-updated')
    assert.equal(ui.pending.length, 2)
    assert.equal(ui.pending[0].signal.aborted, true, 'old matrix definitions are cancelled')
    assert.equal(ui.pending[1].signal.aborted, false)
    await ui.dispatch('fixture:matrix-poll')
    assert.equal(ui.pending.length, 2, 'the superseded request must not unlock the replacement')
    await ui.finish(ui.pending[1])
    assert.ok(ui.host.textContent?.includes('1 matches'))
    await ui.dispatch('fixture:matrix-poll')
    assert.equal(ui.pending.length, 3)
  } finally { await ui.close() }
})
