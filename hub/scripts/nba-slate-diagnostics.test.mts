import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { nbaSlateFailure } from '../src/lib/nbaSlateDiagnostics.ts'

test('known slate failure boundaries map to fixed reason categories', () => {
  const messages: Record<string, string> = {
    'NBA research is warming; retry shortly': 'cache-warming',
    'NBA source temporarily unavailable; retry shortly': 'cache-cooldown',
    'NBA shared cache unavailable': 'cache-read',
    'NBA shared refresh unavailable': 'cache-lease',
    'NBA shared refresh could not commit': 'cache-commit',
    'NBA shared refresh missing': 'cache-commit',
    'Pregame research archive unavailable': 'archive',
    'Pregame research could not be archived': 'archive',
    'NBA slate comparison snapshot exceeds its size limit': 'snapshot-size',
    'No NBA boards available': 'no-boards',
    'NBA slate phase could not settle': 'phase',
  }
  for (const [message, reason] of Object.entries(messages)) assert.deepEqual(nbaSlateFailure('archive', new Error(message)), { stage: 'archive', reason })
  const timeout = new Error('private detail'); timeout.name = 'TimeoutError'
  assert.deepEqual(nbaSlateFailure('prices', timeout), { stage: 'prices', reason: 'timeout' })
})

test('unrecognized error messages and custom fields are never returned in diagnostics', () => {
  const sensitive = 'private-identifier-secret-123'
  const failure = Object.assign(new Error(sensitive), { cause: sensitive, status: sensitive })
  for (const input of [failure, sensitive, { message: sensitive }, null]) {
    const result = nbaSlateFailure('shared-cache', input)
    assert.deepEqual(result, { stage: 'shared-cache', reason: 'unknown' })
    assert.equal(JSON.stringify(result).includes(sensitive), false)
  }
})

test('slate route uses private diagnostics and retains the generic public response', async () => {
  const source = await readFile(new URL('../src/app/the-paint/slate/route.ts', import.meta.url), 'utf8')
  assert.match(source, /console\.error\('\[The Court\] slate unavailable', nbaSlateFailure\(stage, error\)\)/)
  assert.match(source, /NextResponse\.json\(\{ error: 'NBA slate could not load\. Try again shortly\.' \}, \{ status: 503 \}\)/)
})

test('the real route logs fixed categories without leaking errors and returns the same public 503', async () => {
  const source = await readFile(new URL('../src/app/the-paint/slate/route.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const secret = 'private-data-must-not-appear', logs: unknown[][] = []
  let failAt: 'schedule' | 'follower' = 'schedule'
  const imports: Record<string, unknown> = {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/paintAccess': { requirePaintAccess: async () => ({ error: null }) },
    '@/lib/nbaOddsMode': { nbaOddsMode: () => 'pregame' },
    '@/lib/nbaMarketSelection': { nbaReadSelection: () => null },
    '@/lib/nbaPaint': { nbaDate: (date: string) => date, PAINT_MARKETS: [{ key: 'points' }] },
    '@/lib/nbaPaintData': { getPaintSchedule: async () => { if (failAt === 'schedule') throw new Error(secret); return { games: [] } } },
    '@/lib/nbaSharedCache': { nbaSharedCache: async () => { throw new Error('NBA research is warming; retry shortly') } },
    '@/lib/nbaSlateDiagnostics': { nbaSlateFailure },
    '@/lib/nbaResearchResources': {}, '@/lib/nbaSlate': {}, '@/lib/nbaMarketSignal': {},
    '@/lib/nbaIntelligence': {}, '@/lib/nbaOddsClockData': {}, '@/lib/nbaSlateFreezeData': {}, '@/lib/nbaSlateHeat': {},
  }
  const target = { exports: {} as { GET: (request: unknown) => Promise<Response> } }
  new Function('require', 'module', 'exports', 'console', output)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, { error: (...args: unknown[]) => logs.push(args) })
  const request = { nextUrl: new URL('https://test/the-paint/slate?date=2026-10-28&market=points&book=all&side=over') }
  const first = await target.exports.GET(request)
  assert.equal(first.status, 503); assert.deepEqual(await first.json(), { error: 'NBA slate could not load. Try again shortly.' })
  assert.deepEqual(logs[0], ['[The Court] slate unavailable', { stage: 'schedule', reason: 'unknown' }])
  failAt = 'follower'
  const second = await target.exports.GET(request)
  assert.equal(second.status, 503); assert.deepEqual(await second.json(), { error: 'NBA slate could not load. Try again shortly.' })
  assert.deepEqual(logs[1], ['[The Court] slate unavailable', { stage: 'shared-cache', reason: 'cache-warming' }])
  assert.equal(JSON.stringify(logs).includes(secret), false)
})
