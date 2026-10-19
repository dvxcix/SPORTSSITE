import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.slipsurge.com' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
type Result = { postId: string; pickIds: string[] }
const item = { id: 'saved-leg', sport: 'nba', player_id: '447', player_name: 'Karl-Anthony Towns', team: 'NYK', prop_key: 'nba:points:milestone:25', prop_label: '25+ points', book: 'fanduel', odds: 360, status: 'pending' }
const state = { postBet: async (): Promise<Result> => ({ postId: 'posted-pick', pickIds: ['tracked-pick'] }) }
;(globalThis as typeof globalThis & { watchlistPostFixture: typeof state }).watchlistPostFixture = state
const stubs: Record<string, string> = {
  'next/link': `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`,
  '@/context/WatchlistContext': `export const useWatchlist=()=>({signedIn:true,loading:false,error:null,items:[${JSON.stringify(item)}],pendingCount:1,postBet:(...args)=>globalThis.watchlistPostFixture.postBet(...args),remove:async()=>{},removeMany:async()=>{}})`,
  '@/lib/useDraggableFab': `export const useDraggableFab=()=>({ref:()=>{},handlers:{},style:{}})`,
  '@/components/BookLogo': `export const BookLogo=()=>null`,
  '@/components/sports/PlayerAvatar': `export const PlayerAvatar=()=>null`,
  './ShareWatchlistModal': `export const ShareWatchlistModal=()=>null`,
  '@/components/ui/ModalSurface': `import React from 'react';export const ModalSurface=({open,labelledBy,onClose,children})=>open?<section role="dialog" aria-labelledby={labelledBy} onKeyDown={event=>{if(event.key==='Escape')onClose()}}>{children}</section>:null`,
}
const bundled = await build({ stdin: { contents: `export {WatchlistButton} from './src/components/dugout/WatchlistPanel'`, resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, outfile: 'watchlist.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json', plugins: [{ name: 'watchlist-fixture', setup(builder) { builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : undefined); builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: resolve('.') })) } }] })
const compiled = { exports: {} as { WatchlistButton: ComponentType } }
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(require, compiled, compiled.exports)

async function harness(post: (legs: unknown[], options: Record<string, unknown>) => Promise<Result>) {
  state.postBet = post as typeof state.postBet
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(createElement(compiled.exports.WatchlistButton)))
  const click = async (element: Element | null | undefined) => { assert.ok(element); await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))) }
  const button = (label: string) => [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === label)
  await act(async () => window.dispatchEvent(new dom.window.Event('ss:open-watchlist')))
  const close = async () => { await act(async () => root.unmount()); host.remove() }
  return { host, button, click, close }
}

test('a confirmed private post returns to the watchlist with its exact View pick link and submits once', async () => {
  let calls = 0, finish!: (result: Result) => void
  const pending = new Promise<Result>(resolve => { finish = resolve })
  const ui = await harness(async (legs, options) => { calls++; assert.equal(legs.length, 1); assert.equal(options.visibility, 'private'); assert.equal(options.wagerAmount, null); return pending })
  try {
    await ui.click(ui.button('Post'))
    const submit = ui.button('Post Pick')!
    await act(async () => { submit.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); submit.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
    assert.equal(calls, 1)
    assert.equal(ui.host.querySelector<HTMLButtonElement>('[aria-label="Close post pick dialog"]')?.disabled, true)
    await act(async () => { ui.host.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    assert.ok(ui.button('Posting…'))
    await act(async () => { finish({ postId: 'actual-server-post-id', pickIds: ['tracked-id'] }); await pending })
    const status = ui.host.querySelector('[role="status"]')
    assert.ok(status); assert.match(status.textContent ?? '', /Pick posted/)
    assert.equal(status.querySelector('a')?.getAttribute('href'), '/posts/actual-server-post-id')
    assert.equal(ui.host.querySelector('[aria-labelledby="post-bet-title"]'), null)
    assert.match(ui.host.textContent ?? '', /Karl-Anthony Towns/)
    assert.equal(calls, 1)
    await ui.click(ui.host.querySelector('[aria-label="Dismiss posting confirmation"]'))
    assert.equal(ui.host.querySelector('[role="status"]'), null)
  } finally { await ui.close() }
})

test('failed posting keeps the composer and error visible without a success link or automatic retry', async () => {
  let calls = 0
  const ui = await harness(async () => { calls++; throw new Error('Market changed. Review the current price.') })
  try {
    await ui.click(ui.button('Post')); await ui.click(ui.button('Post Pick'))
    assert.equal(calls, 1)
    assert.match(ui.host.querySelector('[role="alert"]')?.textContent ?? '', /Market changed/)
    assert.ok(ui.host.querySelector('[aria-labelledby="post-bet-title"]'))
    assert.equal(ui.host.querySelector('[role="status"]'), null)
    assert.equal(ui.host.querySelector<HTMLButtonElement>('[aria-label="Close post pick dialog"]')?.disabled, false)
    assert.equal(ui.button('Post Pick')?.hasAttribute('disabled'), false)
  } finally { await ui.close() }
})
