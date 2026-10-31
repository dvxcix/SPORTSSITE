import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.slipsurge.com/search?q=smith' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const samplePosts = [
  { id: 'baseball1', sport: 'MLB', content: 'smith', author_id: 'x', author: { username: 'baseball1' }, post_type: 'pick', pick_data: { player_name: 'smith' }, created_at: '2026-10-31T13:00:00Z' },
  { id: 'baseball2', sport: 'mlb', content: 'smith', author_id: 'x', author: { username: 'baseball2' }, post_type: 'pick', pick_data: { player_name: 'smith' }, created_at: '2026-10-31T12:00:00Z' },
  { id: 'football', sport: 'NFL', content: 'smith', author_id: 'y', author: { username: 'football' }, post_type: 'pick', pick_data: { player_name: 'smith' }, created_at: '2026-10-31T11:00:00Z' },
]
const fixture = {
  auth: { user: { id: 'viewer' }, profile: { account_type: 'user' }, loading: false, authUnavailable: false, retrySession() {}, signOut() {} },
  selectedPostColumns: [] as string[],
}
const client = {
  from(table: string) {
    const query = {
      select(columns: string) { if (table === 'posts') fixture.selectedPostColumns.push(columns); return query },
      eq: () => query, not: () => query, or: () => query, ilike: () => query, in: () => query, order: () => query, limit: () => query, abortSignal: () => query,
      maybeSingle: async () => ({ data: null, error: null }),
      then(resolveValue: (result: unknown) => unknown) { return Promise.resolve({ data: table === 'posts' ? samplePosts : [], error: null, count: 0 }).then(resolveValue) },
    }
    return query
  },
  channel() { return { on() { return { subscribe: () => ({}) } } } },
  removeChannel() {},
}
Object.assign(globalThis, { mlbSearchFixture: { fixture, client } })
const stubs: Record<string, string> = {
  'next/navigation': 'export const useSearchParams=()=>({get:()=>"smith"});export const useRouter=()=>({push(){}})',
  'next/link': 'import React from "react";export default ({children,...props})=>React.createElement("a",props,children)',
  '@/context/AuthContext': 'export const useAuth=()=>globalThis.mlbSearchFixture.fixture.auth',
  '@/lib/supabase/client': 'export const createClient=()=>globalThis.mlbSearchFixture.client',
  '@/lib/blocks': 'export const getBlockedEitherWayIds=async()=>[]',
  '@/components/sports/PlayerAvatar': 'export const PlayerAvatar=()=>null;export const TeamLogo=()=>null',
  '@slipsurge/core/mlb-api': 'export const mlbHeadshot=()=>null;export const mlbTeamLogo=()=>null',
  '@slipsurge/core/mlbTeamColors': 'export const getTeamLogoUrl=()=>null',
  '@/components/shared/NflTeamLogo': 'export const NflTeamLogo=()=>null',
  '@/lib/sportLogos': 'export const sportLogoUrl=()=>null',
  '@/lib/emoji': 'export const useCustomEmojis=()=>[]',
  '@/components/social/NotificationsList': 'export const collapseConsecutiveFollows=items=>items',
  '@slipsurge/core/tiers': 'export const effectiveTier=()=>"free";export const hasFullAccessOverride=()=>false',
  '@/components/ui/badge': 'import React from "react";export const Badge=({children})=>React.createElement("span",null,children)',
  '@/components/social/MemberAvatar': 'export const MemberAvatar=()=>null',
  '@/components/social/UserBadges': 'export const UserBadges=()=>null',
  '@/components/ui/SafeImage': 'export const SafeImage=()=>null',
  '@/components/ui/FloatingSurface': 'import React from "react";export const FloatingSurface=({open,children})=>open?React.createElement("div",null,children):null',
  '@/components/social/EmojiText': 'import React from "react";export const EmojiText=({text})=>React.createElement("span",null,text)',
  '@/components/social/LinkifiedText': 'import React from "react";export const LinkifiedText=({text})=>React.createElement("span",null,text)',
  '@/components/product/ProductPage': 'import React from "react";export const ProductHero=()=>null;export const ProductPageShell=({children})=>React.createElement("div",null,children)',
  '@/lib/nbaAccessPolicy': 'export const hasNbaAccess=()=>false',
}
const bundle = await build({
  stdin: { contents: 'export { SearchClient } from "./src/components/search/SearchClient"; export { TopBar } from "./src/components/layout/TopBar"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'search-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { SearchClient: ComponentType; TopBar: ComponentType } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)
const pause = () => new Promise(done => setTimeout(done, 380))

for (const name of ['SearchClient', 'TopBar'] as const) test(`${name} hides MLB posts from members but keeps NFL and admin results`, async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ players: [], teams: [] })
  fixture.selectedPostColumns.length = 0
  fixture.auth.profile = { account_type: 'admin' }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(compiled.exports[name])); await Promise.resolve() })
    if (name === 'TopBar') {
      const input = host.querySelector<HTMLInputElement>('input[aria-label="Search SlipSurge"]')!
      await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'smith'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
    }
    await act(async () => { await pause() })
    assert.ok(host.textContent?.includes('baseball1'), 'admin sees MLB post')
    assert.ok(host.textContent?.includes('football'), 'NFL post remains visible')
    assert.ok(fixture.selectedPostColumns.every(columns => /\bsport\b/.test(columns)), 'post query includes sport')
    fixture.auth.profile = { account_type: 'user' }
    await act(async () => { root.render(createElement(compiled.exports[name])) })
    assert.ok(!host.textContent?.includes('baseball1'), 'stale admin search results are hidden immediately')
    await act(async () => { await pause() })
    assert.ok(host.textContent?.includes('football'), 'NFL remains available after role change')
    assert.ok(!host.textContent?.includes('baseball2'), 'refetched member results hide MLB')
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
})
