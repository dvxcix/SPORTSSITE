import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.slipsurge.com/workspace' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const calls: Array<Record<string, unknown>> = []
Object.assign(globalThis, { mlbWorkspaceFixture: { client: {
  rpc: async (_name: string, args: Record<string, unknown>) => { calls.push(args); return { error: null } },
  from: () => ({ insert: (values: Record<string, unknown>) => ({ select: () => ({ single: async () => ({ data: { ...values, id: 'new-workspace', description: '', created_at: '', updated_at: '' }, error: null }) }) }) }),
} } })
const stubs: Record<string, string> = {
  '@/lib/supabase/client': 'export const createClient=()=>globalThis.mlbWorkspaceFixture.client',
  '@/components/sports/PlayerAvatar': 'export const PlayerAvatar=()=>null',
  './WorkspaceCollaboration': 'export const WorkspaceCollaboration=()=>null',
  './WorkspaceMarketCard': 'import React from "react";export const WorkspaceMarketCard=({item,onRemove})=>React.createElement("button",{"aria-label":"remove-"+item.id,onClick:onRemove},item.player_name)',
  '@/components/social/LinkifiedText': 'export const LinkifiedText=()=>null',
  '@/components/social/SlateEdgeEvidenceCard': 'export const SlateEdgeEvidenceCard=()=>null',
  '@/lib/slateEdgeEvidence': 'export const isSlateEdgeEvidence=()=>false',
}
const bundle = await build({
  stdin: { contents: 'export { ResearchWorkspaceClient } from "./src/components/research/ResearchWorkspaceClient"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'workspace-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : args.path.endsWith('.module.css') ? { path: args.path, namespace: 'css-fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' }))
    builder.onLoad({ filter: /.*/, namespace: 'css-fixture' }, () => ({ contents: 'export default new Proxy({}, {get:(_,key)=>String(key)})', loader: 'js' }))
  } }],
})

test('creating and saving a workspace does not copy hidden MLB matrices from the previous workspace', async () => {
  calls.length = 0
  const workspace = { id: 'w1', user_id: 'owner', name: 'Saved', description: '', sport: 'MULTI', watchlist_item_ids: [], mlb_matrix_ids: ['hidden-matrix'], nfl_matrix_ids: ['nfl-matrix'], created_at: '', updated_at: '' }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(compiled.exports.ResearchWorkspaceClient, { userId: 'owner', showMlb: false, initialItems: [], initialMlbMatrices: [], initialNflMatrices: [], initialWorkspaces: [workspace], initialNotes: [], initialEvidenceItems: [] })) })
    const input = host.querySelector<HTMLInputElement>('input[aria-label="New workspace name"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'New workspace')
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    const create = host.querySelector<HTMLButtonElement>('button[aria-label="Create workspace"]')!
    assert.equal(create.disabled, false)
    await act(async () => { create.click(); await Promise.resolve() })
    const save = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Save')!
    await act(async () => { save.click(); await Promise.resolve() })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].p_mlb_matrix_ids, [])
    assert.deepEqual(calls[0].p_nfl_matrix_ids, ['nfl-matrix'])
  } finally { await act(async () => root.unmount()); host.remove() }
})
const compiled = { exports: {} as { ResearchWorkspaceClient: ComponentType<Record<string, unknown>> } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)

test('saving the same workspace repeatedly keeps hidden MLB and visible overflow selections', async () => {
  calls.length = 0
  const items = ['v1', 'v2', 'v3', 'v4', 'v5'].map(id => ({ id, sport: 'NFL', player_name: id, team: 'KC', prop_label: 'Touchdown' }))
  const workspace = { id: 'w1', user_id: 'owner', name: 'Saved', description: '', sport: 'MULTI', watchlist_item_ids: ['hidden-mlb', 'hidden-mlb2', 'hidden-mlb3', 'hidden-mlb4', 'v1', 'v2', 'v3', 'v4', 'v5'], mlb_matrix_ids: ['hidden-matrix'], nfl_matrix_ids: [], created_at: '', updated_at: '' }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(compiled.exports.ResearchWorkspaceClient, { userId: 'owner', showMlb: false, initialItems: items, initialMlbMatrices: [], initialNflMatrices: [], initialWorkspaces: [workspace], initialNotes: [], initialEvidenceItems: [] })) })
    const remove = host.querySelector<HTMLButtonElement>('button[aria-label="remove-v1"]')
    assert.ok(remove, 'first visible entry is selected')
    await act(async () => { remove.click() })
    const save = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Save')
    assert.ok(save)
    await act(async () => { save.click(); await Promise.resolve() })
    await act(async () => { save.click(); await Promise.resolve() })
    assert.equal(calls.length, 2)
    for (const args of calls) {
      const saved = args.p_watchlist_item_ids as string[]
      assert.equal(saved.includes('v1'), false)
      for (const id of ['v2', 'v3', 'v4', 'v5', 'hidden-mlb', 'hidden-mlb2', 'hidden-mlb3', 'hidden-mlb4']) assert.ok(saved.includes(id), `retains ${id}`)
      assert.deepEqual(args.p_mlb_matrix_ids, ['hidden-matrix'])
    }
  } finally { await act(async () => root.unmount()); host.remove() }
})
