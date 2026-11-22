import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement } from 'react'

const require = createRequire(import.meta.url), { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.slipsurge.com', pretendToBeVisual: true })
Object.assign(globalThis, { Event: dom.window.Event })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const stubs: Record<string, string> = {
  'next/navigation': `export const usePathname=()=>'/the-paint'`,
  'next/link': `import{createElement}from'react';export default({children,...props})=>createElement('a',props,children)`,
  '@/context/WatchlistContext': `let signedIn=true;const items=[];export const setSignedIn=value=>{signedIn=value};export const useWatchlist=()=>({signedIn,items})`,
  '@/context/AuthContext': `import{useWatchlist}from'@/context/WatchlistContext';const user={id:'review-member'},profile={account_type:'ultimate'};export const useAuth=()=>({user:useWatchlist().signedIn?user:null,profile})`,
  '@/lib/myPicks': `export const fetchMyPicks=async()=>[]`,
  '@/lib/supabase/client': `export const createClient=()=>({channel:()=>({on(){return this},subscribe(){return{}}}),removeChannel(){}})`,
  '@/lib/useDraggableFab': `export const useDraggableFab=()=>({ref:{current:null},handlers:{},style:{}})`,
  '@/components/social/PostCardClient': `export const PostCardClient=()=>null`,
  './PostBetModal': `export const PostBetModal=()=>null`,
  './ShareWatchlistModal': `export const ShareWatchlistModal=()=>null`,
}
const bundle = await build({ stdin: { contents: `export{ResearchSavedActions}from'./src/components/research/ResearchSavedActions';export{UtilityDock}from'./src/components/layout/UtilityDock';export{MyPicksButton}from'./src/components/dugout/MyPicksPanel';export{WatchlistButton}from'./src/components/dugout/WatchlistPanel';export{setSignedIn}from'@/context/WatchlistContext'`, resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, outfile: 'research-saved.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json', loader: { '.css': 'empty' }, plugins: [{ name: 'saved-fixture', setup(builder) { builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined); builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' })) } }] })
const target = { exports: {} as any }
new Function('require', 'module', 'exports', bundle.outputFiles.find(file => file.path.endsWith('.cjs'))!.text)(require, target, target.exports)
const api = target.exports

async function fixture({ signedIn = true, nflMatrix = false } = {}) {
  api.setSignedIn(signedIn)
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(createElement('div', {}, createElement(api.ResearchSavedActions, { nflMatrix }), createElement(api.UtilityDock, {}, createElement(api.MyPicksButton), createElement(api.WatchlistButton)))))
  return { host, close: async () => { await act(async () => root.unmount()); host.remove() } }
}

test('research headers open the existing single drawers from hidden dock hosts and restore keyboard focus', async () => {
  const h = await fixture()
  try {
    assert.equal(h.host.querySelector('[aria-label="Open quick tools"]'), null)
    assert.equal(h.host.querySelector('.ss-utility-dock-items')?.hasAttribute('hidden'), true)
    assert.ok(h.host.querySelector('[aria-label="VOLT — Sparks coming soon"]'))
    for (const [label, title] of [['Open my picks', 'my-picks-panel-title'], ['Open watchlist', 'watchlist-panel-title']]) {
      const opener = h.host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
      await act(async () => { opener.focus(); opener.click() })
      const panels = document.querySelectorAll(`[role="dialog"][aria-labelledby="${title}"]`)
      assert.equal(panels.length, 1)
      assert.equal(panels[0].closest('[hidden]'), null)
      assert.equal(document.querySelectorAll('[role="dialog"]').length, 1)
      await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      assert.equal(document.querySelector('[role="dialog"]'), null)
      assert.equal(document.activeElement, opener)
    }
  } finally { await h.close() }
})

test('NFL Matrix remains available beside Picks and Watchlist while VOLT is the only floating launcher', async () => {
  const h = await fixture({ nflMatrix: true })
  let opened = 0
  const matrix = () => { opened++ }
  window.addEventListener('ss:open-nfl-matrices', matrix)
  try {
    const button = h.host.querySelector<HTMLButtonElement>('[aria-label="Open NFL matrices"]')!
    await act(async () => button.click()); assert.equal(opened, 1)
    assert.equal(h.host.querySelector('[aria-label="Open quick tools"]'), null)
    assert.equal(h.host.querySelector('.ss-utility-dock-items')?.hasAttribute('hidden'), true)
  } finally { window.removeEventListener('ss:open-nfl-matrices', matrix); await h.close() }
})

test('signed-out visitors see VOLT without member-only saved-research or quick-tool controls', async () => {
  const h = await fixture({ signedIn: false, nflMatrix: true })
  try {
    assert.equal(h.host.querySelector('[aria-label="Saved research"]'), null)
    assert.equal(h.host.querySelector('.ss-utility-dock-items'), null)
    assert.equal(h.host.querySelector('[aria-label="Open quick tools"]'), null)
    assert.ok(h.host.querySelector('[aria-label="VOLT — Sparks coming soon"]'))
  } finally { await h.close() }
})
