import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url)), ts = require('typescript')
function load(file, mocks = {}) {
  const source = fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const fixtureModule = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (!(id in mocks)) throw Error(`Unexpected dependency ${id}`)
    return mocks[id]
  }, fixtureModule, fixtureModule.exports)
  return fixtureModule.exports
}
const pause = load('lib/mlbOffseason.ts')
const next = { NextResponse: { json: Response.json } }
const pipeline = { withPipelineHealth: (_job, handler) => handler }
const report = () => ({ claimed: 0, attempted: 0, checked: 0, graded: 0, skipped: 0, won: 0, reasons: {}, issues: [] })

test('MLB-only jobs are paused and absent from the scheduler while NFL/NBA stay live', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const paused = ['bdl-odds','dispatch-scrapes','poll-pikkit-picks','scrape-pikkit','scrape-fanduel','scrape-mgm','market-dna-maintenance','process-contact-alerts','process-contact-recap-exports','slate-drop','hr-alerts','near-hr-alerts','lineup-confirmed','mlb-sync-bio','savant-sync-pitch-log','dugout-statcast-precompute']
  for (const job of paused) {
    assert.equal(pause.isMlbCronPaused(job), true, job)
    assert.equal(config.crons.some(c => c.path.split('?')[0] === `/api/cron/${job}`), false, job)
  }
  for (const job of ['grade-live-picks','settle-picks','nfl-bdl-odds','poll-pikkit-nfl-picks','nba-market-capture','poll-pikkit-nba-picks','replay-operational-retries']) {
    assert.equal(pause.isMlbCronPaused(job), false, job)
    assert.ok(config.crons.some(c => c.path.split('?')[0] === `/api/cron/${job}`), job)
  }
})

test('authenticated MLB jobs return before pipeline ledger and handler; unrelated handlers remain reachable', async () => {
  let touched = 0
  const { withPipelineHealth } = load('lib/pipelineHealth.ts', {
    'node:crypto': { randomUUID: () => 'id' }, '@/lib/supabase/admin': { createAdminClient: () => { touched++; throw Error('unexpected ledger') } },
    '@/lib/cron-auth': { isCronRequestAuthorized: () => true }, '@/lib/safeApiError': { safeErrorMetadata: () => ({}) }, '@/lib/mlbOffseason': pause,
  })
  const handler = async () => { touched++; throw Error('unexpected source') }
  for (const job of ['poll-pikkit-picks','scrape-fanduel','market-dna-maintenance','process-contact-alerts']) {
    const response = await withPipelineHealth(job, handler)(new Request('https://example.test/'))
    assert.equal((await response.json()).paused, true)
  }
  assert.equal(touched, 0)
})

test('both shared settlement jobs skip MLB and still grade NFL and NBA', async () => {
  for (const job of ['grade-live-picks','settle-picks']) {
    const calls = []
    const route = load(`app/api/cron/${job}/route.ts`, {
      'next/server': next, '@/lib/pipelineHealth': pipeline, '@/lib/supabase/admin': { createAdminClient: () => ({}) },
      '@/lib/cron-auth': { requireCronAuth: () => null }, '@/lib/mlbOffseason': pause,
      '@/lib/sportSettlement': { settleSportPicks: async (_admin, sport) => { calls.push(sport); return report() } },
      '@/lib/nbaSettlement': { settleNbaPicks: async () => { calls.push('NBA'); return report() } },
    })
    const body = await (await route.GET(new Request('https://example.test/'))).json()
    assert.deepEqual(calls.sort(), ['NBA','NFL']); assert.equal(body.mlb.paused, true)
  }
})

test('webhook returns before parsing or verifying MLB source data', async () => {
  const route = load('app/api/internal/contact-alert/route.ts', {
    'next/server': { ...next, after: () => { throw Error('unexpected delivery') } }, '@/lib/mlbOffseason': pause,
    '@/lib/cron-auth': {}, '@slipsurge/core/mlbSchedule': {}, '@/lib/hrFeed': {}, '@/lib/contactAlertEvents': {}, '@/lib/contactAlertOutbox': {}, '@/lib/mlbPartyServer': {},
  })
  const response = await route.POST(new Request('https://example.test/', { method: 'POST', body: 'not JSON' }))
  assert.equal((await response.json()).paused, true)
})

test('MLB pick submission stops before schedule or insert for every signed-in account', async () => {
  const route = load('app/api/posts/pick/route.ts', {
    'next/server': next, '@/lib/mlbOffseason': pause, '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } }) },
    '@/lib/supabase/admin': {}, '@slipsurge/core/mlbSchedule': {}, '@slipsurge/core/parlayCalc': {}, '@/lib/watchlist': {}, '@/lib/mentions': {}, '@/lib/notify': {},
    '@/app/the-sideline/data': {}, '@/app/the-sideline/kickoff': {}, '@/lib/nflPickOffer': {}, '@/lib/nbaPickValidation': {}, '@/lib/paintAccess': {}, '@/lib/pickGrading': {}, '@/lib/nflPickGrading': {}, '@/lib/mlbCaptureWindow': {},
  })
  const request = new Request('https://example.test/', { method: 'POST', body: JSON.stringify({ sport: 'MLB' }) })
  assert.equal((await route.POST(request)).status, 503)
})

test('the shared retry worker filters MLB slate jobs before its limit without starving other deliveries', async () => {
  const filters = [], delivered = [], updates = []
  const other = { id: 'other', provider: 'discord', operation: 'post_channel_message', attempts: 0, max_attempts: 5, payload: { channelId: 'channel', payload: { content: 'other sport' } } }
  const q = table => {
    let mode = '', ors = []
    const chain = {
      update: v => { mode = 'update'; updates.push(v); return chain }, select: () => { if (!mode) mode = 'select'; return chain },
      eq: () => chain, lt: () => chain, neq: () => chain, lte: () => chain, order: () => chain, limit: () => chain,
      like: () => { throw Error('paused slate must not be recovered') },
      or: value => { ors.push(value); filters.push(value); return chain },
      maybeSingle: async () => ({ data: { id: 'other' }, error: null }),
      then(resolve, reject) {
        if (table === 'operational_retry_queue' && (mode === 'select' || (mode === 'update' && ors.length))) assert.equal(ors.length, 2)
        return Promise.resolve({ data: mode === 'select' ? [other] : null, error: null, count: 0 }).then(resolve, reject)
      },
    }
    return chain
  }
  const route = load('app/api/cron/replay-operational-retries/route.ts', {
    'next/server': next, '@/lib/pipelineHealth': pipeline, '@/lib/mlbOffseason': pause,
    '@/lib/cron-auth': { requireCronAuth: () => null }, '@/lib/supabase/admin': { createAdminClient: () => ({ from: q }) },
    '@/lib/discord': { postToChannelChecked: async (_channel, payload) => { delivered.push(payload.content); return { ok: true } } },
  })
  const body = await (await route.GET(new Request('https://example.test/'))).json()
  assert.deepEqual(delivered, ['other sport']); assert.equal(body.succeeded, 1)
  assert.equal(filters.filter(v => v.includes('nonce')).length, 2)
  assert.equal(filters.filter(v => v.includes('dedupe_key')).length, 2)
  assert.equal(updates.some(v => v.last_error?.startsWith('Daily slate delivery confirmation')), false)
})

test('shared watchlist and scheduled post jobs filter MLB but preserve other sports and null sport', async () => {
  for (const job of ['archive-stale-watchlist','publish-scheduled-posts']) {
    const filters = []
    const chain = { update: () => chain, select: () => chain, eq: () => chain, lt: () => chain, lte: () => chain, order: () => chain, limit: () => chain,
      or: value => { filters.push(value); return chain }, then: (resolve, reject) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject) }
    const route = load(`app/api/cron/${job}/route.ts`, {
      'next/server': next, '@/lib/pipelineHealth': pipeline, '@/lib/mlbOffseason': pause,
      '@/lib/cron-auth': { requireCronAuth: () => null }, '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => chain }) }, '@/lib/safeApiError': {},
    })
    assert.equal((await route.GET(new Request('https://example.test/'))).status, 200)
    assert.deepEqual(filters, ['sport.is.null,sport.not.ilike.MLB'])
  }
})

test('direct MLB browser collectors and authenticated importers stop before source or writes', async () => {
  const mocks = {
    'next/server': next, '@/lib/mlbOffseason': pause, '@/lib/cron-auth': { requireBrowserbaseCronAuth: () => null },
    '@slipsurge/core/mlbSchedule': {}, '@/lib/browserbase': {}, '@/lib/scrapers/mgmScraper': {}, '@/lib/scrapers/pikkitScraper': {},
    '@/lib/scrapers/gameMatch': {}, '@/lib/scrapers/fanout': {}, '@/lib/platform': {}, '@/lib/scrapers/pikkitAuth': {}, '@/lib/pikkitCoverage': {}, '@/lib/pikkitBrowserLease': {},
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) }, from: () => ({ select() { return this }, eq() { return this }, single: async () => ({ data: { account_type: 'admin' } }) }) }) },
    '@/lib/supabase/admin': {}, '@slipsurge/core/nameNorm': {}, '@/lib/safeApiError': {}, '@/lib/mlbCaptureWindow': {},
    '@/lib/scrapers/fanduelMarkets': {}, '@/lib/scrapers/fanduelArchive': {}, '@/lib/pikkitImportValidation': {}, '@/lib/mlbPublicCapture': {},
  }
  for (const job of ['scrape-pikkit','scrape-mgm']) {
    const route = load(`app/api/cron/${job}/route.ts`, mocks)
    assert.equal((await (await route.GET(new Request('https://example.test/'))).json()).paused, true, job)
  }
  for (const job of ['pikkit-import','fanduel-import','mgm-import']) {
    const route = load(`app/api/admin/${job}/route.ts`, mocks)
    const response = await route.POST(new Request('https://example.test/', { method: 'POST' }))
    assert.equal(response.status, 503, job); assert.equal((await response.json()).paused, true)
  }
})

test('Discord help and slate do not disclose or fetch the retired league', async () => {
  let deferred = 0
  const route = load('app/api/discord/interactions/route.ts', {
    'next/server': { ...next, after: () => { deferred++ } }, '@/lib/mlbOffseason': pause,
    '@/lib/discord': { verifyDiscordSignature: () => true }, '@slipsurge/core/mlbSchedule': {}, '@/lib/platform': {},
  })
  for (const name of ['help','slate']) {
    const response = await route.POST(new Request('https://example.test/', { method: 'POST', body: JSON.stringify({ type: 2, data: { name } }) }))
    const body = await response.json()
    assert.equal(body.type, 4); assert.equal(JSON.stringify(body).includes('MLB'), false)
  }
  assert.equal(deferred, 0)
})
