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
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
const blockA = deferred<string[]>(), blockB = deferred<string[]>(), oldUsers = deferred<{ data: unknown[] }>()
const fixture = { auth: { user: { id: 'account-a' }, loading: false, authUnavailable: false }, blockA, blockB, oldUsers, socialQueries: 0 }
const people = [{ id: 'hidden', username: 'hidden-smith', display_name: 'Hidden Smith' }, { id: 'visible', username: 'visible-smith', display_name: 'Visible Smith' }]
const client = {
  from(table: string) {
    let columns = ''
    const query = {
      select(value: string) { columns = value; return query },
      eq: () => query, or: () => query, ilike: () => query, in: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: null, error: null }),
      then(resolveValue: (value: { data: unknown[] }) => unknown) {
        if (table === 'users' && !columns.startsWith('account_type')) {
          globalFixture.socialQueries++
          if (globalFixture.auth.user.id === 'account-a') return oldUsers.promise.then(resolveValue)
          return Promise.resolve({ data: people }).then(resolveValue)
        }
        return Promise.resolve({ data: [] }).then(resolveValue)
      },
    }
    return query
  },
}
Object.assign(globalThis, { searchBlockFixture: { ...fixture, client } })
const globalFixture = (globalThis as unknown as { searchBlockFixture: typeof fixture & { client: typeof client } }).searchBlockFixture
const stubs: Record<string, string> = {
  'next/navigation': 'export const useSearchParams=()=>({get:()=>"smith"}); export const useRouter=()=>({push(){}})',
  'next/link': 'import React from "react";export default ({children,...props})=>React.createElement("a",props,children)',
  '@/context/AuthContext': 'export const useAuth=()=>globalThis.searchBlockFixture.auth',
  '@/lib/supabase/client': 'export const createClient=()=>globalThis.searchBlockFixture.client',
  '@/lib/blocks': 'export const getBlockedEitherWayIds=(_client,id)=>id==="account-a"?globalThis.searchBlockFixture.blockA.promise:globalThis.searchBlockFixture.blockB.promise',
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
  '@/lib/nbaAccessPolicy': 'export const hasNbaAccess=()=>false',
}
const bundle = await build({
  stdin: { contents: 'export {SearchClient} from "./src/components/search/SearchClient"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'search-block-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { SearchClient: ComponentType } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)
const pause = () => new Promise(resolveValue => setTimeout(resolveValue, 360))

test('search hides social results while blocks are pending and after an account switch with a late old response', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ players: [], teams: [] })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(compiled.exports.SearchClient)) })
    await act(async () => { await pause() })
    assert.equal(globalFixture.socialQueries, 0)
    assert.ok(!host.textContent?.includes('Smith'))
    await act(async () => { blockA.resolve(['hidden']); await Promise.resolve() })
    await act(async () => { await pause() })
    assert.equal(globalFixture.socialQueries, 1)
    globalFixture.auth = { user: { id: 'account-b' }, loading: false, authUnavailable: false }
    await act(async () => { root.render(createElement(compiled.exports.SearchClient)); oldUsers.resolve({ data: people }); await Promise.resolve() })
    assert.ok(!host.textContent?.includes('Hidden Smith'))
    assert.ok(!host.textContent?.includes('Visible Smith'))
    await act(async () => { blockB.resolve(['visible']); await Promise.resolve() })
    await act(async () => { await pause() })
    assert.ok(host.textContent?.includes('Hidden Smith'))
    assert.ok(!host.textContent?.includes('Visible Smith'))
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
})

test('a failed block lookup never starts member/post search and explains unavailable results', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ players: [], teams: [] })
  globalFixture.auth = { user: { id: 'account-a' }, loading: false, authUnavailable: false }
  globalFixture.socialQueries = 0
  globalFixture.blockA = deferred<string[]>()
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(compiled.exports.SearchClient)) })
    await act(async () => { globalFixture.blockA.reject(new Error('unavailable')); await Promise.resolve() })
    await act(async () => { await pause() })
    assert.equal(globalFixture.socialQueries, 0)
    assert.ok(host.textContent?.includes('Member and post results are temporarily unavailable.'))
    assert.ok(!host.textContent?.includes('Hidden Smith'))
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
})

test('NBA access is private, fails closed and cannot leak across an account switch', async () => {
  const originalFetch = globalThis.fetch
  const first = deferred<Response>(), second = deferred<Response>()
  let checks = 0
  globalThis.fetch = async (input, init) => {
    if (input === '/api/account/nba-access') {
      assert.equal(init?.cache, 'no-store')
      assert.equal(init?.credentials, 'same-origin')
      checks++
      return checks === 1 ? first.promise : second.promise
    }
    return Response.json({ players: [], teams: [] })
  }
  globalFixture.auth = { user: { id: 'account-a' }, loading: false, authUnavailable: false }
  globalFixture.blockA = deferred<string[]>()
  globalFixture.blockB = deferred<string[]>()
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const hasNbaTab = () => [...host.querySelectorAll('button')].some(button => button.textContent?.trim() === 'NBA')
  try {
    await act(async () => { root.render(createElement(compiled.exports.SearchClient)); await Promise.resolve() })
    assert.equal(checks, 1)
    assert.equal(hasNbaTab(), false)
    globalFixture.auth = { user: { id: 'account-b' }, loading: false, authUnavailable: false }
    await act(async () => { root.render(createElement(compiled.exports.SearchClient)); await Promise.resolve() })
    assert.equal(checks, 2)
    await act(async () => { second.resolve(Response.json({ allowed: false })); await Promise.resolve() })
    await act(async () => { first.resolve(Response.json({ allowed: true })); await Promise.resolve() })
    assert.equal(hasNbaTab(), false, 'late prior-user access must not reach the new user')
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
})

test('switching accounts removes previously granted NBA access while the next decision is pending', async () => {
  const originalFetch = globalThis.fetch
  const nextDecision = deferred<Response>()
  let checks = 0
  globalThis.fetch = async input => {
    if (input === '/api/account/nba-access') {
      checks++
      return checks === 1 ? Response.json({ allowed: true }) : nextDecision.promise
    }
    if (String(input).startsWith('/api/search/nfl')) return Response.json({ players: [], teams: [{ team_abbr: 'TEST', team_name: 'Test team', team_nick: null, team_logo_espn: null }] })
    return Response.json({ players: [], teams: [] })
  }
  globalFixture.auth = { user: { id: 'account-a' }, loading: false, authUnavailable: false }
  globalFixture.blockA = deferred<string[]>()
  globalFixture.blockB = deferred<string[]>()
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const hasNbaTab = () => [...host.querySelectorAll('button')].some(button => button.textContent?.trim() === 'NBA')
  try {
    await act(async () => { root.render(createElement(compiled.exports.SearchClient)); await Promise.resolve() })
    await act(async () => { await pause() })
    assert.equal(hasNbaTab(), true, 'the verified first account has access')
    globalFixture.auth = { user: { id: 'account-b' }, loading: false, authUnavailable: false }
    await act(async () => { root.render(createElement(compiled.exports.SearchClient)); await Promise.resolve() })
    assert.equal(checks, 2)
    assert.equal(hasNbaTab(), false, 'a new account cannot inherit the earlier account’s access')
    await act(async () => { nextDecision.resolve(Response.json({ allowed: false })); await Promise.resolve() })
    assert.equal(hasNbaTab(), false)
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
})
