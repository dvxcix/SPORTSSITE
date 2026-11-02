import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const fixture = {
  userId: 'viewer' as string | null,
  accountType: 'user',
  authError: false,
  authThrows: false,
  accountError: false,
  accountThrows: false,
  accountReads: 0,
  groupSelect: '',
  groupLimit: 0,
}
const rows = [
  { id: 'a', slug: 'baseball-a', name: 'Baseball A', sport: 'MLB' },
  { id: 'b', slug: 'baseball-b', name: 'Baseball B', sport: 'mLb' },
  { id: 'c', slug: 'baseball-c', name: 'Baseball C', sport: ' mlb ' },
  { id: 'd', slug: 'neutral', name: 'Neutral Group', sport: null },
  { id: 'e', slug: 'basketball', name: 'Basketball Group', sport: 'NBA' },
  { id: 'f', slug: 'football', name: 'Football Group', sport: 'NFL' },
  { id: 'g', slug: 'general', name: 'General Group', sport: '' },
  { id: 'h', slug: 'fifth', name: 'Fifth Group', sport: 'NBA' },
].map(row => ({ ...row, is_public: true, member_count: 10, access_type: 'free' }))
const client = {
  auth: { getUser: async () => { if (fixture.authThrows) throw new Error('auth unavailable'); return { data: { user: fixture.userId ? { id: fixture.userId } : null }, error: fixture.authError ? { message: 'auth unavailable' } : null } } },
  from(table: string) {
    const query = {
      select(fields: string) { if (table === 'groups') fixture.groupSelect = fields; return query },
      eq() { return query }, order() { return query }, gte() { return query },
      limit(value: number) { if (table === 'groups') fixture.groupLimit = value; return query },
      async maybeSingle() {
        fixture.accountReads++
        if (fixture.accountThrows) throw new Error('account unavailable')
        return { data: { account_type: fixture.accountType }, error: fixture.accountError ? { message: 'account unavailable' } : null }
      },
      then(done: (value: unknown) => unknown) {
        return Promise.resolve({ data: table === 'groups' ? rows.slice(0, fixture.groupLimit) : [], error: null }).then(done)
      },
    }
    return query
  },
}
Object.assign(globalThis, { communityFixture: { client } })

async function loadPage(hibernating: boolean) {
  const stubs: Record<string, string> = {
    'server-only': '',
    'next/link': 'import React from "react";export default ({children,...props})=>React.createElement("a",props,children)',
    '@/lib/supabase/server': 'export const createClient=async()=>globalThis.communityFixture.client',
    '@/components/community/CommunityNav': 'export const CommunityNav=()=>null',
    '@/components/ui/SafeImage': 'export const SafeImage=()=>null',
    '@/components/product/ProductPage': 'import React from "react";export const ProductHero=()=>null;export const ProductSectionHeader=()=>null;export const ProductPanel=({children})=>React.createElement("div",null,children);export const ProductPageShell=({children})=>React.createElement("main",null,children)',
  }
  const result = await build({
    entryPoints: ['src/app/community/page.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
    plugins: [{ name: 'community-fixture', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (args.path === './mlbOffseason' && args.importer.endsWith('mlbViewerAccess.ts')) return { path: 'mlbOffseason', namespace: 'fixture' }
        if (args.path in stubs) return { path: args.path, namespace: 'fixture' }
      })
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'mlbOffseason' ? `export const MLB_HIBERNATING=${hibernating}` : stubs[args.path], loader: 'tsx' }))
    } }],
  })
  const compiled = { exports: {} as { default: () => Promise<React.ReactNode> } }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, compiled, compiled.exports)
  return compiled.exports.default
}

const duringOffseason = await loadPage(true)
const duringSeason = await loadPage(false)
function reset() {
  Object.assign(fixture, { userId: 'viewer', accountType: 'user', authError: false, authThrows: false, accountError: false, accountThrows: false, accountReads: 0, groupSelect: '', groupLimit: 0 })
}

test('regular member excludes case and whitespace MLB variants before taking four, keeping neutral and other sports', async () => {
  reset()
  const html = renderToStaticMarkup(await duringOffseason())
  for (const name of ['Baseball A', 'Baseball B', 'Baseball C', 'Fifth Group']) assert.ok(!html.includes(name), name)
  for (const name of ['Neutral Group', 'Basketball Group', 'Football Group', 'General Group']) assert.ok(html.includes(name), name)
  assert.ok(fixture.groupSelect.split(',').includes('sport'))
  assert.equal(fixture.groupLimit, 50)
  assert.equal(fixture.accountReads, 1)
})

test('authenticated admin retains the original order and four-item preview', async () => {
  reset(); fixture.accountType = 'admin'
  const html = renderToStaticMarkup(await duringOffseason())
  for (const name of ['Baseball A', 'Baseball B', 'Baseball C', 'Neutral Group']) assert.ok(html.includes(name), name)
  assert.ok(!html.includes('Basketball Group'))
})

test('failed account lookup and failed authentication both hide MLB even if a stale admin value is present', async () => {
  for (const condition of ['accountError', 'accountThrows', 'authError', 'authThrows'] as const) {
    reset(); fixture.accountType = 'admin'; fixture[condition] = true
    const html = renderToStaticMarkup(await duringOffseason())
    assert.ok(!html.includes('Baseball A'), condition)
    assert.ok(html.includes('Basketball Group'), condition)
    if (condition === 'authError' || condition === 'authThrows') assert.equal(fixture.accountReads, 0)
  }
})

test('no session hides MLB in offseason; disabling offseason restores it without an account lookup', async () => {
  reset(); fixture.userId = null
  const offseason = renderToStaticMarkup(await duringOffseason())
  assert.ok(!offseason.includes('Baseball A'))
  assert.equal(fixture.accountReads, 0)
  const inSeason = renderToStaticMarkup(await duringSeason())
  assert.ok(inSeason.includes('Baseball A'))
  assert.equal(fixture.accountReads, 0)
})
