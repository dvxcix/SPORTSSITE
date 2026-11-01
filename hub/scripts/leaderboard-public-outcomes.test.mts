import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const id = '10000000-0000-0000-0000-000000000001'
const rows = [
  { id: '1', author_id: id, sport: 'NBA', pick_data: { result: 'win' }, created_at: '2026-10-31T00:00:00Z', visibility: 'public', is_premium: false, creator_product_id: null },
  { id: '2', author_id: id, sport: 'NFL', pick_data: { result: 'loss' }, created_at: '2026-10-31T00:01:00Z', visibility: 'followers', is_premium: false, creator_product_id: null },
  { id: '3', author_id: id, sport: 'NFL', pick_data: { result: 'loss' }, created_at: '2026-10-31T00:02:00Z', visibility: 'premium', is_premium: true, creator_product_id: null },
  { id: '4', author_id: id, sport: 'NFL', pick_data: { result: 'loss' }, created_at: '2026-10-31T00:03:00Z', visibility: 'public', is_premium: false, creator_product_id: 'product' },
  { id: '5', author_id: id, sport: 'NFL', pick_data: { result: 'loss' }, created_at: '2026-10-31T00:04:00Z', visibility: 'public', is_premium: true, creator_product_id: null },
]
const observed = { filters: [] as string[], publicReads: 0, adminPosts: 0 }
function query(table: string, isAdmin: boolean) {
  if (table === 'posts' && isAdmin) observed.adminPosts++
  if (table === 'posts' && !isAdmin) observed.publicReads++
  const filters: Record<string, unknown> = {}
  const q = {
    select: () => q, in: () => q, not: () => q, order: () => q,
    eq: (key: string, value: unknown) => { filters[key] = value; observed.filters.push(`${key}=${value}`); return q },
    is: (key: string, value: unknown) => { filters[key] = value; observed.filters.push(`${key}=${value}`); return q },
    range: async () => ({ error: null, data: table === 'users'
      ? [{ id, username: 'member', is_private: false, hide_win_rate: false, pick_record: { wins: 9, losses: 1, pushes: 0 } }]
      : rows.filter(row => row.visibility === filters.visibility && row.is_premium === filters.is_premium && row.creator_product_id === filters.creator_product_id) }),
  }
  return q
}
const admin = { from: (table: string) => query(table, true), rpc: () => ({ abortSignal: async () => ({ data: [id], error: null }) }) }
const anon = { from: (table: string) => query(table, false) }
Object.assign(globalThis, { leaderboardPublicFixture: { admin, anon, observed } })
const stubs: Record<string, string> = {
  'next/cache': 'export const unstable_cache=(f)=>f',
  '@supabase/supabase-js': 'export const createClient=()=>globalThis.leaderboardPublicFixture.anon',
  '@/lib/supabase/admin': 'export const createAdminClient=()=>globalThis.leaderboardPublicFixture.admin',
  '@/lib/supabase/server': 'export const createClient=async()=>({auth:{getUser:async()=>({data:{user:null},error:null})}})',
  '@/lib/blocks': 'export const authVisibilityUnavailable=()=>false;export const getBlockedEitherWayIds=async()=>[]',
  '@/lib/mlbViewerAccess': 'export const canViewMlb=async()=>false',
  '@/lib/mlbLeaderboardVisibility': 'export const filterLeaderboardSports=(users,allSports)=>({users,allSports})',
  './LeaderboardClient': 'import React from "react";export const LeaderboardClient=()=>React.createElement("div")',
  '@/components/product/ProductPage': 'import React from "react";export const ProductHero=()=>null;export const ProductAction=()=>null;export const ProductPageShell=({children})=>React.createElement("main",null,children)',
}
const result = await build({
  stdin: { contents: 'export { default } from "./src/app/leaderboard/page"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'public-outcomes-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' }))
  } }],
})
type RenderedClient = { props: { users?: { wins: number; losses: number; recentResults: string[]; bySport: Record<string, unknown> }[] } }
const compiled = { exports: {} as { default: () => Promise<{ props: { children: RenderedClient[] } }> } }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports)

test('shared leaderboard derives post breakdowns from public, non-product outcomes only', async () => {
  const tree = await compiled.exports.default()
  // Execute the stub client element to inspect its actual server-computed props.
  const children = tree.props.children
  const client = children.find(child => child?.props?.users)
  assert.ok(client)
  assert.ok(client.props.users)
  const user = client.props.users[0]
  assert.equal(user.wins, 9) // Authoritative aggregate remains unchanged.
  assert.equal(user.losses, 1)
  assert.deepEqual(user.recentResults, ['W'])
  assert.deepEqual(Object.keys(user.bySport), ['NBA'])
  assert.equal(observed.adminPosts, 0)
  assert.equal(observed.publicReads, 1)
  assert.deepEqual(observed.filters, ['visibility=public', 'is_premium=false', 'creator_product_id=null'])
})
