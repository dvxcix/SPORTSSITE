import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { NextResponse } from 'next/server'

async function fixture(options: { hibernating?: boolean; clock?: string | null; frozen?: string | null } = {}) {
  let providerCalls = 0
  const cutoff = '2026-10-12T18:00:00.000Z'
  const tables: Record<string, unknown> = {
    pregame_odds_snapshots: { home_abbr: 'HOU', away_abbr: 'NYY', is_frozen: !!options.frozen, frozen_at: options.frozen ?? null },
    mlb_research_clock: options.clock ? { start_at: options.clock } : null,
    pregame_odds_snapshot_history: [
      { captured_at: '2026-10-12T17:59:00.000Z', prop_map: { player: { name: 'Player', hr: { book: 100 } } } },
      { captured_at: cutoff, prop_map: { player: { name: 'Player', hr: { book: 200 } } } },
      { captured_at: '2026-10-12T18:01:00.000Z', prop_map: { player: { name: 'Player', hr: { book: 300 } } } },
    ],
    fanduel_gap_odds: [
      { name_norm: 'other', player_name: 'Other', updated_at: '2026-10-12T17:58:00.000Z', fhr_fd: 700 },
      { name_norm: 'late', player_name: 'Late', updated_at: cutoff, fhr_fd: 800 },
    ],
    market_opening_prices: [
      { name_norm: 'early', market: 'hr', opening_price: 900, captured_at: '2026-10-12T17:55:00.000Z' },
      { name_norm: 'late', market: 'hr', opening_price: 500, captured_at: cutoff },
    ],
  }
  const from = (table: string) => {
    const result = { data: tables[table] ?? null, error: null }
    const chain = { select: () => chain, eq: () => chain, order: () => chain, range: async () => result, maybeSingle: async () => result }
    return chain
  }
  const source = await readFile(new URL('../src/app/api/odds-terminal/route.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const imports: Record<string, unknown> = {
    'next/cache': { unstable_cache: (fn: unknown) => fn }, 'next/server': { NextResponse },
    '@/lib/requireTier': { requireTier: async () => ({ userId: 'admin' }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from }) },
    '@/lib/mlbFirstPitch': { getFirstPitchAt: async () => { providerCalls++; return cutoff } },
    '@slipsurge/core/teamAbbr': { canonGameKey: (key: string) => key },
    '@/lib/hrrArchive': { getThreePlusHrrArchive: async () => [] },
    '@/lib/hrrMarket': { threePlusHrr: () => null },
    '@/lib/mlbOffseason': { MLB_HIBERNATING: options.hibernating !== false },
  }
  const mod = { exports: {} as { GET: (req: Request) => Promise<Response> } }
  new Function('require', 'exports', 'module', outputText)((name: string) => {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`)
    return imports[name]
  }, mod.exports, mod)
  return { get: () => mod.exports.GET(new Request('https://example.test/api/odds-terminal?gamePk=123&date=2026-10-12')), providerCalls: () => providerCalls }
}

test('offseason odds use the saved game clock, not a later freeze-processing timestamp', async () => {
  const h = await fixture({ clock: '2026-10-12T18:00:00.000Z', frozen: '2026-10-12T18:09:00.000Z' })
  const response = await h.get(), body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(h.providerCalls(), 0)
  assert.equal(body.firstPitchAt, '2026-10-12T18:00:00.000Z')
  assert.equal(body.frozen, true)
  assert.ok(body.snapshots.length > 0)
  assert.ok(body.snapshots.every((row: { captured_at: string }) => Date.parse(row.captured_at) < Date.parse(body.firstPitchAt)))
  assert.equal(JSON.stringify(body.snapshots).includes('"late"'), false)
})

test('missing saved cutoff withholds historical odds rather than fetching or mixing prices', async () => {
  for (const options of [{}, { frozen: '2026-10-12T18:09:00.000Z' }]) {
    const h = await fixture(options)
    const response = await h.get()
    assert.equal(response.status, 503)
    assert.equal(h.providerCalls(), 0)
  }
})

test('normal season still uses the existing first-pitch provider', async () => {
  const h = await fixture({ hibernating: false })
  assert.equal((await h.get()).status, 200)
  assert.equal(h.providerCalls(), 1)
})
