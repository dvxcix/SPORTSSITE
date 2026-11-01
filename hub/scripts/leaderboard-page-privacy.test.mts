import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const one = '10000000-0000-0000-0000-000000000001'
const two = '10000000-0000-0000-0000-000000000002'
const state = { ids: [one, two], fail: false, blocked: [] as string[], calls: 0 }
const ranked = [{ id: one, username: 'first', wins: 10 }, { id: two, username: 'second', wins: 5 }]
const service = { rpc: () => ({ abortSignal: async () => { state.calls++; return state.fail ? { data: null, error: {} } : { data: state.ids, error: null } } }) }
const userClient = { auth: { getUser: async () => ({ data: { user: { id: 'viewer' } }, error: null }) } }
Object.assign(globalThis, { leaderboardPrivacyFixture: { state, ranked, service, userClient } })
const stubs: Record<string, string> = {
  'next/cache': 'export const unstable_cache=()=>async()=>({ranked:globalThis.leaderboardPrivacyFixture.ranked,allSports:["NFL"]})',
  '@/lib/supabase/server': 'export const createClient=async()=>globalThis.leaderboardPrivacyFixture.userClient',
  '@/lib/supabase/admin': 'export const createAdminClient=()=>globalThis.leaderboardPrivacyFixture.service',
  '@/lib/blocks': 'export const authVisibilityUnavailable=()=>false;export const getBlockedEitherWayIds=async()=>globalThis.leaderboardPrivacyFixture.state.blocked',
  '@/lib/mlbViewerAccess': 'export const canViewMlb=async()=>false',
  '@/lib/mlbLeaderboardVisibility': 'export const filterLeaderboardSports=(users,allSports)=>({users,allSports})',
  './LeaderboardClient': 'import React from "react";export const LeaderboardClient=({users})=>React.createElement("div",null,users.map(user=>React.createElement("span",{key:user.id},user.username)))',
  '@/components/product/ProductPage': 'import React from "react";export const ProductHero=()=>null;export const ProductAction=()=>null;export const ProductPageShell=({children})=>React.createElement("main",null,children)',
}
const result = await build({
  stdin: { contents: 'export { default } from "./src/app/leaderboard/page"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'leaderboard-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { default: () => Promise<React.ReactNode> } }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, compiled, compiled.exports)

test('fresh privacy and block checks filter the same cached ranking for each request', async () => {
  state.ids = [one, two]; state.blocked = []; state.fail = false; state.calls = 0
  const initial = renderToStaticMarkup(await compiled.exports.default())
  assert.ok(initial.includes('first')); assert.ok(initial.includes('second'))
  state.ids = [one]
  const hidden = renderToStaticMarkup(await compiled.exports.default())
  assert.ok(hidden.includes('first')); assert.ok(!hidden.includes('second'))
  state.ids = [one, two]; state.blocked = [one]
  const blocked = renderToStaticMarkup(await compiled.exports.default())
  assert.ok(!blocked.includes('first')); assert.ok(blocked.includes('second'))
  state.fail = true
  const unavailable = renderToStaticMarkup(await compiled.exports.default())
  assert.ok(!unavailable.includes('first')); assert.ok(!unavailable.includes('second'))
  assert.equal(state.calls, 4)
})
