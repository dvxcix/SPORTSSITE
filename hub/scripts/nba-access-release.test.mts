import * as oddsMode from '../src/lib/nbaOddsMode.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import * as policy from '../src/lib/nbaAccessPolicy.ts'

async function compiled(file: string, imports: Record<string, unknown>, fallback?: (name: string) => unknown) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } })
  const target = { exports: {} as Record<string, unknown> }
  new Function('require', 'exports', 'module', outputText)((name: string) => {
    if (name === '@/lib/nbaOddsMode' || name === './nbaOddsMode') return oddsMode
    if ((name === './nbaOddsClockData' || name === '@/lib/nbaOddsClockData') && !(name in imports)) return {getNbaOddsGame:async(game:unknown)=>game}
    if (name in imports) return imports[name]
    assert.ok(fallback, name); return fallback(name)
  }, target.exports, target)
  return target.exports
}
type Profile = policy.NbaAccessProfile & { beta_access_active?: boolean; nfl_early_access?: boolean }
async function access(profile: Profile | null, signedIn = true, failed = false) {
  let reads = 0, current = profile
  const gates = await compiled('../src/lib/paintAccess.ts', {
    'server-only': {}, 'next/server': { NextResponse: { json: Response.json } }, '@/lib/nbaAccessPolicy': policy,
    '@/lib/requireTier': { resolveAuthedClient: async () => ({ userId: signedIn ? 'viewer' : null, supabase: { from: (table: string) => {
      assert.equal(table, 'users'); reads++
      return { select: (columns: string) => { assert.equal(columns, policy.NBA_ACCESS_COLUMNS); return { eq: (key: string, id: string) => {
        assert.equal(key, 'id'); assert.equal(id, 'viewer'); return { maybeSingle: async () => ({ data: current, error: failed ? new Error('unavailable') : null }) }
      } } } }
    } } }) },
  })
  type Result = { userId?: string; isAdmin?: boolean; error?: Response }
  return { gate: gates.requirePaintAccess as () => Promise<Result>, admin: gates.requirePaintAdmin as () => Promise<Result>, get reads() { return reads }, replace: (next: Profile) => { current = next } }
}

test('NBA release allows effective Ultimate and admin, excluding unrelated beta, NFL grants and role-name claims', async () => {
  for (const [profile, allowed] of [
    [{ account_type: 'admin', tier: 'free' }, true], [{ account_type: 'user', tier: 'ultimate' }, true],
    [{ tier: 'free', admin_granted_tier: 'ultimate' }, true], [{ tier: 'ultimate', discord_advanced_claimed: true }, true],
    [{ tier: 'advanced', discord_advanced_claimed: true }, false], [{ tier: 'basic' }, false], [{ tier: 'free' }, false],
    [{ tier: 'free', beta_access_active: true }, false], [{ tier: 'free', nfl_early_access: true }, false],
    [{ account_type: 'ultimate', tier: 'free' }, false], [{ tier: 'invalid', admin_granted_tier: 'invalid' }, false],
    [{ tier: 'advanced', admin_granted_tier: 'basic' }, false],
  ] as [Profile, boolean][]) {
    assert.equal(policy.hasNbaAccess(profile), allowed)
    const h = await access(profile), result = await h.gate()
    assert.equal(result.error?.status, allowed ? undefined : 403)
    assert.equal(h.reads, 1)
    if (allowed) assert.equal(result.isAdmin, profile.account_type === 'admin')
  }
  const guest = await access(null, false)
  assert.equal((await guest.gate()).error?.status, 401); assert.equal(guest.reads, 0)
  for (const h of [await access(null), await access({ account_type: 'admin' }, true, true)]) assert.equal((await h.gate()).error?.status, 503)
  const revoked = await access({ tier: 'ultimate' })
  assert.equal((await revoked.gate()).error, undefined)
  revoked.replace({ tier: 'free' }); assert.equal((await revoked.gate()).error?.status, 403); assert.equal(revoked.reads, 2)
})

test('every NBA customer data endpoint rejects lower tiers before reading research or invoking providers', async () => {
  const h = await access({ tier: 'advanced' })
  let reads = 0
  const blocked = new Proxy({}, { get: () => () => { reads++; throw new Error('Data access before membership') } })
  const routes = ['board', 'divergence', 'estimate', 'history', 'intelligence', 'profile', 'public', 'results', 'scouting', 'shots', 'slate', 'tracking']
  for (const route of [...routes.map(route => `../src/app/the-paint/${route}/route.ts`), '../src/app/api/search/nba/route.ts']) {
    const api = await compiled(route, { '@/lib/paintAccess': { requirePaintAccess: h.gate }, 'next/server': { NextResponse: { json: Response.json } } }, () => blocked)
    const response = await (api.GET as (req: Request) => Promise<Response>)(new Request('https://test/the-paint/board?game=123'))
    assert.equal(response.status, 403, route)
  }
  assert.equal(reads, 0)
})

test('paid Ultimate board data works while model internals and manual capture remain admin-only', async () => {
  const h = await access({ account_type: 'user', tier: 'ultimate' })
  let reads = 0
  const board = { game: { id: 123 }, players: [], fetchedAt: '2026-10-20T02:00:00Z' }
  const api = await compiled('../src/app/the-paint/board/route.ts', {
    'node:crypto': await import('node:crypto'), 'next/server': { NextResponse: { json: Response.json } },
    '@/lib/paintAccess': { requirePaintAccess: h.gate }, '@/lib/nbaPaintData': { getPaintGame: async () => { reads++; return { id: 123 } }, getPaintBoard: async () => board },
  })
  const request = { nextUrl: new URL('https://test/the-paint/board?game=123'), headers: new Headers() }
  const response = await (api.GET as (request: unknown) => Promise<Response>)(request)
  assert.equal(response.status, 200); assert.equal(reads, 1)
  assert.equal((await response.json()).game.id, 123)
  reads = 0
  const blocked = new Proxy({}, { get: () => () => { reads++; throw new Error('Operational work before admin') } })
  for (const [path, method] of [['models', 'GET'], ['public/capture', 'POST']]) {
    const route = await compiled(`../src/app/the-paint/${path}/route.ts`, { '@/lib/paintAccess': { requirePaintAdmin: h.admin }, 'next/server': { NextResponse: { json: Response.json } } }, () => blocked)
    assert.equal((await (route[method] as (request: Request) => Promise<Response>)(new Request('https://test'))).status, 403)
  }
  assert.equal(reads, 0)
  const admin = await access({ account_type: 'admin', tier: 'free' })
  assert.equal((await admin.admin()).error, undefined)
})

test('NBA page gates render membership fallback before loading any research; guests receive a sign-in path', async () => {
  let reads = 0
  const Fallback = (props: { status: number }) => jsxRuntime.jsx('div', { 'data-status': props.status })
  const blocked = new Proxy({}, { get: () => () => { reads++; throw new Error('Page data before membership') } })
  for (const path of ['the-paint/page.tsx', 'nba/page.tsx', 'nba/players/[id]/page.tsx', 'nba/teams/[id]/page.tsx']) {
    const page = await compiled(`../src/app/${path}`, {
      'react/jsx-runtime': jsxRuntime, '@/lib/paintAccess': { requirePaintAccess: async () => ({ error: Response.json({}, { status: 403 }) }) },
      '@/components/nba/NbaAccessFallback': { NbaAccessFallback: Fallback },
    }, () => blocked)
    const rendered = await (page.default as (props: unknown) => Promise<React.ReactNode>)({ params: Promise.resolve({ id: '123' }), searchParams: Promise.resolve({}) })
    assert.match(renderToStaticMarkup(rendered), /data-status="403"/)
  }
  assert.equal(reads, 0)
  const fallback = await compiled('../src/components/nba/NbaAccessFallback.tsx', {
    'react/jsx-runtime': jsxRuntime, 'next/link': { default: 'a' }, 'next/navigation': { redirect: (path: string) => { throw new Error(path) } },
    '@/components/layout/TierUpsell': { TierUpsell: (props: { requiredTier: string }) => jsxRuntime.jsx('div', { children: props.requiredTier }) },
  })
  const render = fallback.NbaAccessFallback as (props: { status: number }) => React.ReactNode
  assert.throws(() => render({ status: 401 }), /auth\/login\?next=%2Fthe-paint/)
  assert.match(renderToStaticMarkup(render({ status: 403 })), /ultimate/)
  assert.match(renderToStaticMarkup(render({ status: 503 })), /membership could not be checked/)
})

test('NBA member public activity omits provider URLs and internal capture metadata', async () => {
  const snapshot = { gameId: 123, capturedAt: '2026-10-19T20:00:00Z', rows: [{ playerId: 1, market: 'points', picks: 42 }], markets: ['points'], sourceUrl: 'https://app.pikkit.com/event/private', rawPayload: 'private', unmatched: 9, rawCategories: [{ label: 'private source label' }], coverage: { observed: 1, unmatched: 9, unsupported: 1 } }
  const query: any = { select: () => query, eq: () => query, lte: () => query, gte: () => query, order: () => query, limit: () => query, abortSignal: async () => ({ data: [{ snapshot, captured_at: snapshot.capturedAt }], error: null }) }
  const data = await compiled('../src/lib/nbaPublicData.ts', {
    './nbaPublicHistory': await import('../src/lib/nbaPublicHistory.ts'),
    './nbaPaintData': { getPaintGame: async () => ({id:123,datetime:'2026-10-20T23:00:00Z',status:'Scheduled'}) },
    'server-only': {}, './supabase/admin': { createAdminClient: () => ({ from: () => query }) },
    './nbaSharedCache': { nbaSharedCache: async (_key: string, _ttl: number, _stale: number, load: () => Promise<unknown>) => ({ value: await load() }) },
  })
  const api = await compiled('../src/app/the-paint/public/route.ts', {
    '@/lib/paintAccess': { requirePaintAccess: async () => ({ userId: 'member' }) },
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/nbaPublicData': data,
  })
  const response = await (api.GET as (request: unknown) => Promise<Response>)({ nextUrl: new URL('https://test?game=123') })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body.captures[0].snapshot.rows, [{ ...snapshot.rows[0], capturedAt: '2026-10-19T20:00:00.000Z', previous: null, previousAt: null }])
  assert.deepEqual(body.captures[0].snapshot.coverage, { observed: 1 })
  assert.doesNotMatch(JSON.stringify(body), /pikkit|sourceUrl|rawPayload|rawCategories|private source label|unmatched|unsupported/i)
})
