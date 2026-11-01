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
const deferred = <T,>() => { let resolveValue!: (value: T) => void; const promise = new Promise<T>(done => { resolveValue = done }); return { promise, resolve: resolveValue } }
type RecordResult = { records: Map<string, { wins: number; losses: number; pushes: number } | null>; available: boolean }
const author = '00000000-0000-4000-8000-000000000001'
const fixture = { auth: { user: { id: 'account-a' }, loading: false, authUnavailable: false }, a: deferred<RecordResult>(), b: deferred<RecordResult>(), batches: 0 }
const client = { from(table: string) {
  const query = { select: () => query, eq: () => query, or: () => query, ilike: () => query, in: () => query, order: () => query, limit: () => query,
    then(resolveValue: (value: { data: unknown[] }) => unknown) { return Promise.resolve({ data: table === 'users' ? [{ id: author, username: 'smith', display_name: 'Smith', follower_count: 1 }] : [] }).then(resolveValue) } }
  return query
} }
Object.assign(globalThis, { searchRecordFixture: { ...fixture, client } })
const current = (globalThis as unknown as { searchRecordFixture: typeof fixture & { client: typeof client } }).searchRecordFixture
const stubs: Record<string, string> = {
  'next/navigation': 'export const useSearchParams=()=>({get:()=>"smith"});export const useRouter=()=>({push(){}})',
  'next/link': 'import React from "react";export default ({children,...props})=>React.createElement("a",props,children)',
  '@/context/AuthContext': 'export const useAuth=()=>globalThis.searchRecordFixture.auth',
  '@/lib/supabase/client': 'export const createClient=()=>globalThis.searchRecordFixture.client',
  '@/lib/blocks': 'export const getBlockedEitherWayIds=async()=>[]',
  '@/lib/visiblePickRecords': 'export const fetchVisiblePickRecords=()=>{const f=globalThis.searchRecordFixture;f.batches++;return f.auth.user.id==="account-a"?f.a.promise:f.b.promise}',
  '@/components/sports/PlayerAvatar': 'export const PlayerAvatar=()=>null;export const TeamLogo=()=>null',
  '@slipsurge/core/mlb-api': 'export const mlbHeadshot=()=>null;export const mlbTeamLogo=()=>null',
  '@/components/social/UserBadges': 'export const UserBadges=()=>null',
  '@/lib/sportLogos': 'export const sportLogoUrl=()=>null',
  '@slipsurge/core/mlbTeamColors': 'export const getTeamLogoUrl=()=>null',
  '@/components/shared/NflTeamLogo': 'export const NflTeamLogo=()=>null',
  '@/components/social/MemberAvatar': 'export const MemberAvatar=()=>null',
  '@/components/product/ProductPage': 'import React from "react";export const ProductHero=()=>null;export const ProductPageShell=({children})=>React.createElement("div",null,children)',
  '@/components/ui/SafeImage': 'export const SafeImage=()=>null',
  '@/components/social/LinkifiedText': 'export const LinkifiedText=()=>null',
}
const bundle = await build({
  stdin: { contents: 'export {SearchClient} from "./src/components/search/SearchClient"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'search-record-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { SearchClient: ComponentType } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)
const pause = () => new Promise(done => setTimeout(done, 370))

test('a late private search record from the previous account cannot appear after switching', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async input => String(input).includes('/api/account/nba-access') ? Response.json({ allowed: false }) : Response.json({ players: [], teams: [] })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(compiled.exports.SearchClient)) })
    await act(async () => { await pause() })
    assert.equal(current.batches, 1)
    current.auth = { user: { id: 'account-b' }, loading: false, authUnavailable: false }
    await act(async () => { root.render(createElement(compiled.exports.SearchClient)) })
    await act(async () => { await pause() })
    assert.equal(current.batches, 2)
    await act(async () => { current.b.resolve({ records: new Map([[author, { wins: 5, losses: 1, pushes: 0 }]]), available: true }); await Promise.resolve() })
    assert.ok(host.textContent?.includes('5W'))
    await act(async () => { current.a.resolve({ records: new Map([[author, { wins: 99, losses: 1, pushes: 0 }]]), available: true }); await Promise.resolve() })
    assert.ok(!host.textContent?.includes('99W'))
    assert.ok(host.textContent?.includes('5W'))
  } finally { globalThis.fetch = originalFetch; await act(async () => root.unmount()); host.remove() }
})
