import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { BrowserbaseAdmissionError } from '../src/lib/browserbaseAdmissionError.ts'

test('NFL sportsbook treats only a verified pre-create admission denial as deferred', async () => {
  const source = await readFile(new URL('../src/app/api/cron/scrape-fanduel-nfl/route.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const genuine of [true, false]) {
    let opens = 0, ingests = 0
    const game = { gameId: 'fixture', awayName: 'Away Team', homeName: 'Home Team' }
    const mocks: Record<string, unknown> = {
      'next/server': { NextResponse: { json: Response.json } },
      'next/cache': { revalidateTag: () => {} },
      '@/lib/cron-auth': { requireBrowserbaseCronAuth: () => null },
      '@/lib/browserbaseAdmissionError': { BrowserbaseAdmissionError },
      '@/lib/browserbase': { FANDUEL_PROXY_DOMAIN_PATTERN: 'fixture', openSession: async () => {
        opens++
        throw genuine ? new BrowserbaseAdmissionError('spend-limit') : Object.assign(new Error('uncertain'), { name: 'BrowserbaseAdmissionError', code: 'spend-limit' })
      } },
      '@/lib/nflPikkitSchedule': { getUpcomingNflPikkitGames: async () => [game] },
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { board: { players: [{}] } }, error: null }) }) }) }) }) },
      '@/lib/supabase/server': {}, '@/lib/scrapers/fanduelScraper': {}, '@/lib/scrapers/gameMatch': {},
      '@/lib/scrapers/nflFanduelMarkets': {},
      '@/lib/nflFanduel': { attachNflFanduel: (board: unknown) => board, loadNflFanduel: async () => null },
      '@/lib/nflMarketArchive': { ingestNflMarketBoard: async () => { ingests++ } },
      '@/lib/nflCaptureCoverage': {}, '@/lib/nflCaptureStream': {},
      '@/lib/nflCaptureDispatch': { NFL_CAPTURE_EXTRACTION_BUDGET_MS: 360_000, NFL_CAPTURE_SESSION_TIMEOUT_SECONDS: 450 },
    }
    const target = { exports: {} as { GET(request: Request): Promise<Response> } }
    new Function('require', 'module', 'exports', code)((id: string) => { assert.ok(id in mocks, id); return mocks[id] }, target, target.exports)
    const response = await target.exports.GET(new Request('https://fixture.test/capture?gameId=fixture'))
    const body = await response.json()
    assert.equal(opens, 1); assert.equal(ingests, 0)
    assert.equal(response.status, genuine ? 425 : 502)
    if (genuine) assert.deepEqual(body, { error: 'NFL browser capture deferred', budgetCode: 'spend-limit', browserSessions: 0 })
    else assert.equal(body.browserSessions, undefined)
  }
})
