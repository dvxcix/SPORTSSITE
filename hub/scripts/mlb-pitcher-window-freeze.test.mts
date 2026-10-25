import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function compiled(file: string, imports: Record<string, any>, fallback?: (id: string) => any) {
  const source = await readFile(new URL('../' + file, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', output)((id: string) => {
    if (id in imports) return imports[id]
    if (fallback) return fallback(id)
    assert.fail('Unmocked import: ' + id)
  }, module, module.exports)
  return module.exports
}

const game = { gamePk: 42, gameDate: '2026-10-25T20:00:00Z', status: { detailedState: 'Scheduled' } }
const original = { window: { games: 3, dateFrom: '2026-10-01', dateTo: '2026-10-24' }, pitcherRows: { R: [{ pitches: 40 }], L: [] }, batters: { 20: { FF: { R: { pitches: 8 } } } } }
async function routeHarness(options: { closed?: boolean; missing?: boolean; denied?: boolean; cross?: boolean; rosterPitcher?: number; incompleteEvents?: boolean; emptyBatterLog?: boolean; prior?: boolean } = {}) {
  const calls: any[] = []
  class Unavailable extends Error {}
  const board = { homePitcher: { id: options.rosterPitcher ?? 10 }, awayPitcher: { id: 11 }, homeLineup: [{ mlb_id: 21 }], awayLineup: [{ mlb_id: 20 }] }
  const route = await compiled('src/app/api/pitcher-report/live-window/route.ts', {
    'next/server': { NextResponse: { json: (body: any, init: any = {}) => new Response(JSON.stringify(body), { ...init, headers: { ...init.headers, 'Content-Type': 'application/json' } }) } },
    '@/lib/requireTier': { requireTier: async (tier: string) => { calls.push(['tier', tier]); return options.denied ? { error: new Response('denied', { status: 403 }) } : {} } },
    '@/lib/dugoutData': { getMlbResearchGame: async (date: string, id: number) => { calls.push(['game', date, id]); return date === '2026-10-25' && id === 42 ? game : null } },
    '@/lib/mlbPregameResearchData': {
      MlbPregameResearchUnavailable: Unavailable,
      mlbPregameResearchOpen: () => !options.closed,
      readMlbPregameResearch: async (_game: any, resource?: string) => { calls.push([resource ? 'prior' : 'roster']); return resource ? options.prior ? { value: original } : null : { value: board } },
      mlbPregameResearch: async (_game: any, load: any, resource: string) => {
        calls.push(['resource', resource])
        if (options.closed && options.missing) throw new Unavailable()
        if (options.closed) return { value: original, observedAt: '2026-10-25T19:59:00Z', frozen: true }
        try {
          const entry = await load()
          return { value: options.cross ? original : entry.value, observedAt: entry.observedAt, frozen: !!options.cross }
        } catch (error) {
          if (options.prior) return { value: original, observedAt: '2026-10-25T19:59:00Z', frozen: false }
          throw error
        }
      },
    },
    '@slipsurge/core/pitchLog': {
      getPitcherStarts: async (id: number, season: number) => { calls.push(['pitcher', id, season]); return [{ gamePk: 8, date: '2026-10-24' }, { gamePk: 42, date: '2026-10-25' }, { gamePk: 99, date: '2026-10-26' }] },
      getBatterGames: async (id: number, season: number) => { calls.push(['batter', id, season]); return options.emptyBatterLog ? [] : [{ gamePk: 9, date: '2026-10-24' }, { gamePk: 42, date: '2026-10-25' }] },
      fetchManyGamePitchEvents: async (ids: number[]) => { calls.push(['events', ids]); return (options.incompleteEvents ? ids.slice(0, 1) : ids).map(gamePk => ({ gamePk, marker: 'observation' })) },
      pitcherRowsByHand: (events: any[]) => { calls.push(['pitcher-events', events.map(row => row.gamePk)]); return { R: [{ pitches: 999 }], L: [] } },
      batterRowsByPitchTypeAndHand: () => ({ FF: { R: { pitches: 999 } } }),
    },
  })
  return { calls, get: (query: string) => route.GET(new Request('https://app.test/api/pitcher-report/live-window?' + query)) as Promise<Response> }
}
const query = 'pitcherId=10&gamePk=42&date=2026-10-25&games=3'

test('default pitcher window requires the exact game and preserves Basic access gate', async () => {
  const h = await routeHarness()
  assert.equal((await h.get('pitcherId=10&batterIds=20&season=2026')).status, 400)
  assert.deepEqual(h.calls, [['tier', 'basic']])
  const denied = await routeHarness({ denied: true })
  assert.equal((await denied.get(query)).status, 403)
  assert.deepEqual(denied.calls, [['tier', 'basic']])
})

test('closed pitcher window returns the original observation without season/provider reads', async () => {
  const h = await routeHarness({ closed: true })
  const response = await h.get(query)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.pitcherRows, original.pitcherRows)
  assert.equal(body.researchSnapshot.frozen, true)
  assert.deepEqual(h.calls.map(row => row[0]), ['tier', 'game', 'resource'])
})

test('missing closed pitcher window is explicit, with no latest-season substitute', async () => {
  const h = await routeHarness({ closed: true, missing: true })
  const response = await h.get(query)
  assert.equal(response.status, 503)
  assert.equal((await response.json()).unavailable, true)
  assert.deepEqual(h.calls.map(row => row[0]), ['tier', 'game', 'resource'])
})

test('open window uses canonical archived opponent IDs and season, excludes this game and future games', async () => {
  const h = await routeHarness()
  const response = await h.get(query + '&batterIds=999&season=2027')
  assert.equal(response.status, 200)
  assert.deepEqual(h.calls.find(row => row[0] === 'resource'), ['resource', 'pitcher-window:10:3'])
  assert.deepEqual(h.calls.find(row => row[0] === 'pitcher'), ['pitcher', 10, 2026])
  assert.deepEqual(h.calls.filter(row => row[0] === 'batter'), [['batter', 20, 2026]])
  assert.deepEqual(h.calls.find(row => row[0] === 'events'), ['events', [8, 9]])
  assert.deepEqual(h.calls.find(row => row[0] === 'pitcher-events'), ['pitcher-events', [8]], 'hitter history must not extend the pitcher start window')
})

test('unrelated pitcher cannot poison a matchup window; crossing start returns archive winner', async () => {
  const other = await routeHarness({ rosterPitcher: 999 })
  assert.equal((await other.get(query)).status, 503)
  assert.equal(other.calls.some(row => row[0] === 'events'), false)
  const crossing = await routeHarness({ cross: true })
  assert.deepEqual((await (await crossing.get(query)).json()).pitcherRows, original.pitcherRows)
})

test('only explicit live mode loads current form without writing a pregame resource', async () => {
  const h = await routeHarness()
  const response = await h.get('pitcherId=10&batterIds=20&season=2026&games=3&mode=live')
  assert.equal(response.status, 200)
  assert.equal((await response.json()).researchSnapshot.mode, 'live')
  assert.equal(h.calls.some(row => row[0] === 'resource' || row[0] === 'game'), false)
  assert.ok(h.calls.some(row => row[0] === 'events'))
})

const name = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '')
async function renderClient(file: string, states: Record<number, any>, component: string, props: any) {
  let stateIndex = 0
  const memos: any[] = []
  const effects: { run: () => void; deps: any[] }[] = []
  const imports = {
    react: { useState: (initial: any) => { const index = stateIndex++; return [index in states ? states[index] : typeof initial === 'function' ? initial() : initial, () => {}] }, useMemo: (run: any) => { const value = run(); memos.push(value); return value }, useEffect: (run: any, deps: any[]) => effects.push({ run, deps }), useCallback: (fn: any) => fn, useRef: (value: any) => ({ current: value }) },
    'react/jsx-runtime': { jsx: (type: any, props: any) => ({ type, props }), jsxs: (type: any, props: any) => ({ type, props }), Fragment: 'Fragment' },
    'next/navigation': { useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace() {} }), usePathname: () => '/' },
    '@slipsurge/core/nameNorm': { normName: name, resolveNameEntry: (map: any, key: string) => map[key] },
  }
  const api = await compiled(file, imports, id => new Proxy({}, { get: (_object, key) => key === '__esModule' ? true : (key === 'default' && id.endsWith('.css') ? {} : (...args: any[]) => key === 'compareMlbPublicRows' ? args[1].picks - args[0].picks : String(key)) }))
  const tree = api[component](props)
  return { memos, effects, tree }
}
const picks = (n: number, game_key = '') => ({ player_name: 'Same Batter', prop_type: 'home_runs', picks: n, game_key })
const fixtureGame = (gamePk: number, n: number) => ({ gamePk, gameKey: `A@B:${gamePk}`, gameDate: '2026-10-25T20:00:00Z', status: 'Final', homePitcher: { id: 10, name: 'Starter', hand: 'R' }, awayPitcher: null, homeAbbr: 'B', awayAbbr: 'A', homeTeam: 'B', awayTeam: 'A', homeLineup: [], awayLineup: [{ mlb_id: 20, name: 'Same Batter', name_norm: name('Same Batter'), bats: 'R', team: 'A', props: { sa: { fanduel: 400 } } }], pregameInputs: { statSplits: [{ mlb_id: 20, name_norm: name('Same Batter'), pitch_hand: 'R', win: 'season', marker: n }], timingSplits: [], pitcherSplits: [], communityPicks: [picks(n)] }, researchSnapshot: { frozen: true }, outcomes: { 20: { hr: 1 } } })

test('Public view keeps both doubleheader games own untagged saved counts and live outcomes', async () => {
  const data = { games: [fixtureGame(42, 12), fixtureGame(43, 34)], communityPicks: [picks(999)] }
  const h = await renderClient('src/components/the-public/ThePublicClient.tsx', { 0: data }, 'ThePublicClient', { date: '2026-10-25' })
  const categories = h.memos.find(value => value?.hr && value?.hits)
  assert.deepEqual(categories.hr.map((row: any) => [row.gamePk, row.picks]).sort(), [['42', 12], ['43', 34]])
  assert.ok(categories.hr.every((row: any) => row.outcome.hr === 1))
})

test('Public view missing archive cannot borrow global or another game counts', async () => {
  const missing: any = fixtureGame(42, 12); delete missing.pregameInputs; missing.researchSnapshot = { unavailable: true }
  const data = { games: [missing, fixtureGame(43, 34)], communityPicks: [picks(999, 'A@B:42')] }
  const h = await renderClient('src/components/the-public/ThePublicClient.tsx', { 0: data }, 'ThePublicClient', { date: '2026-10-25' })
  const categories = h.memos.find(value => value?.hr && value?.hits)
  assert.deepEqual(categories.hr.map((row: any) => [row.gamePk, row.picks]), [['43', 34]])
  assert.match(JSON.stringify(h.tree), /Pregame public-picks snapshot unavailable/)
})

test('Pitcher Report selected game controls splits and HR counts instead of changing globals', async () => {
  const data = { games: [fixtureGame(42, 12), fixtureGame(43, 34)], communityPicks: [picks(999)], statSplits: [{ mlb_id: 20, pitch_hand: 'R', win: 'season', marker: 999 }] }
  const h = await renderClient('src/components/pitcher-report/PitcherReportClient.tsx', { 0: '2026-10-25', 1: data, 2: false, 3: 'A@B:42-home' }, 'PitcherReportClient', {})
  assert.ok(h.memos.some(value => value?.[name('Same Batter')]?.picks === 12))
  const splitMap = h.memos.find(value => value?.byId?.[20]?.R?.season)
  assert.equal(splitMap.byId[20].R.season.marker, 12)
  assert.equal(JSON.stringify(h.memos).includes('999'), false)
})

test('Pitcher Report missing game inputs does not substitute whole-slate globals', async () => {
  const missing: any = fixtureGame(42, 12); delete missing.pregameInputs; missing.researchSnapshot = { unavailable: true }
  const data = { games: [missing], communityPicks: [picks(999)], statSplits: [{ mlb_id: 20, pitch_hand: 'R', win: 'season', marker: 999 }] }
  const h = await renderClient('src/components/pitcher-report/PitcherReportClient.tsx', { 0: '2026-10-25', 1: data, 2: false, 3: 'A@B:42-home' }, 'PitcherReportClient', {})
  assert.equal(h.memos.some(value => value?.[name('Same Batter')]?.picks), false)
  assert.equal(h.memos.some(value => value?.byId?.[20]), false)
  assert.match(JSON.stringify(h.tree), /Pregame research snapshot unavailable/)
})

test('both sibling views retry a failed boundary refresh, then settle a late-hydrated observation once', async () => {
  for (const client of ['public', 'pitcher']) {
    const row = fixtureGame(42, 12)
    row.gameDate = new Date(Date.now() - 1000).toISOString()
    row.researchSnapshot = { frozen: false }
    const data = { games: [row] }
    const h = client === 'public'
      ? await renderClient('src/components/the-public/ThePublicClient.tsx', { 0: data }, 'ThePublicClient', { date: '2026-10-25' })
      : await renderClient('src/components/pitcher-report/PitcherReportClient.tsx', { 0: '2026-10-25', 1: data, 2: false, 3: 'A@B:42-home' }, 'PitcherReportClient', {})
    const boundary = h.effects.find(effect => effect.deps?.[0] === data && effect.deps?.[1] === '2026-10-25')!
    assert.ok(boundary)
    const timers: (() => void)[] = [], urls: string[] = []
    const savedTimeout = globalThis.setTimeout, savedClear = globalThis.clearTimeout, savedFetch = globalThis.fetch
    try {
      globalThis.setTimeout = ((fn: () => void, delay: number) => { assert.equal(delay, timers.length ? 1000 : 0); timers.push(fn); return 1 }) as any
      globalThis.clearTimeout = (() => {}) as any
      globalThis.fetch = (async (url: any) => { urls.push(String(url)); if (urls.length === 1) throw new Error('temporary network failure'); return new Response(JSON.stringify({ games: [{ ...row, researchSnapshot: { frozen: true } }] })) }) as any
      const cleanup = boundary.run() as any
      assert.equal(timers.length, 1)
      timers[0]()
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(timers.length, 2, 'a failed boundary read must retry')
      timers[1]()
      await new Promise(resolve => setImmediate(resolve))
      assert.deepEqual(urls, ['/api/dugout/data?date=2026-10-25', '/api/dugout/data?date=2026-10-25'])
      cleanup()
      boundary.run()
      assert.equal(timers.length, 2, 'a settled boundary must not create a refresh loop')
    } finally {
      globalThis.setTimeout = savedTimeout; globalThis.clearTimeout = savedClear; globalThis.fetch = savedFetch
    }
  }
})

test('partial game events and disappearing known batter history retain the prior saved window', async () => {
  for (const failure of [{ incompleteEvents: true }, { emptyBatterLog: true }]) {
    const h = await routeHarness({ ...failure, prior: true })
    const response = await h.get(query)
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).pitcherRows, original.pitcherRows)
  }
  const newcomer = await routeHarness({ emptyBatterLog: true })
  assert.equal((await newcomer.get(query)).status, 200, 'no prior history is valid for a new batter')
})
