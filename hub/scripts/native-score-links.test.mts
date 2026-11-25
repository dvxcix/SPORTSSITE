import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'
import type { MLBGameFeed } from '@slipsurge/core/mlb-api'
import { getGameSummary, getScoreboard } from '../packages/core/src/espn-api'

const team = (id: number, name: string, abbreviation: string) => ({ id, name, abbreviation })
const away = team(147, 'New York Yankees', 'NYY'), home = team(111, 'Boston Red Sox', 'BOS')
const participant = (id: number, fullName: string) => ({ id, fullName })
const batter = participant(10, 'Fixture Batter'), pitcher = participant(20, 'Fixture Pitcher')
const boxTeam = (team: typeof home, person: typeof batter) => ({
  team, teamStats: { batting: {}, pitching: {}, fielding: {} }, batters: [person.id], pitchers: [],
  players: { [`ID${person.id}`]: { person, stats: { batting: { atBats: 2, hits: 1 } } } },
})
const mlb = {
  gamePk: 42,
  gameData: {
    game: { pk: 42, season: '2026', type: 'R' },
    datetime: { dateTime: '2026-11-26T01:30:00Z', officialDate: '2026-11-25', dayNight: 'night' },
    status: { abstractGameState: 'Final', detailedState: 'Final', statusCode: 'F' },
    teams: { away, home },
    players: {},
    venue: { id: 1, name: 'Fixture Park' },
  },
  liveData: {
    linescore: {
      currentInning: 9,
      innings: [{ num: 1, ordinalNum: '1st', home: { runs: 0 }, away: { runs: 1 } }],
      teams: { away: { runs: 1, hits: 5, errors: 0, leftOnBase: 2 }, home: { runs: 0, hits: 2, errors: 1, leftOnBase: 3 } },
    },
    plays: { allPlays: [{
      result: { type: 'atBat', event: 'Single', eventType: 'single', description: 'Fixture run scores.', rbi: 1, awayScore: 1, homeScore: 0 },
      about: { atBatIndex: 0, isTopInning: true, halfInning: 'top', inning: 1, startTime: '2026-11-26T01:30:00Z',
        isComplete: true, isScoringPlay: true, hasReview: false, hasOut: false, captivatingIndex: 1 },
      count: { balls: 1, strikes: 2, outs: 0 }, matchup: { batter, pitcher,
        batSide: { code: 'L', description: 'Left' }, pitchHand: { code: 'R', description: 'Right' } },
      pitchIndex: [3], actionIndex: [], runnerIndex: [], playEvents: [{
        index: 3, pitchNumber: 1, type: 'pitch', details: { description: 'Called strike',
          type: { code: 'FF', description: 'Four-seam fastball' }, isBall: false, isStrike: true, isInPlay: false },
        pitchData: { startSpeed: 95.7, spinRate: 2250, coordinates: { pX: 0.2, pZ: 2.1 } },
      }],
    }] },
    boxscore: { teams: { away: boxTeam(away, batter), home: boxTeam(home, pitcher) } },
  },
} satisfies MLBGameFeed
const espn = {
  header: { id: '9', competitions: [{
    date: '2026-11-26T01:30:00Z', status: { type: { state: 'pre', shortDetail: 'Scheduled' } },
    competitors: [
      { homeAway: 'away', score: '0', team: { id: '2', displayName: 'Visitors', abbreviation: 'VST', color: 'b01122' } },
      { homeAway: 'home', score: '0', team: { id: '1', displayName: 'Home', abbreviation: 'HOM', color: '001122' } },
    ],
  }] },
}
Object.assign(globalThis, { scoreFixture: { mlb, espn, sourceCalls: [] as string[] } })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response',
  '@/lib/mlbOffseason': 'export const MLB_HIBERNATING = true',
  './mlbOffseason': 'export const MLB_HIBERNATING = true',
  '@/lib/nflGameCenterServer': 'export const getNflGameCenter = async () => null',
  '@slipsurge/core/espn-api': `export const getGameSummary = async (_, id) => {
    globalThis.scoreFixture.sourceCalls.push(id); return globalThis.scoreFixture.espn;
  }; export const getGameStatus = () => ({state: "pre",label: ""}); export const getTeams = () => ({});`,
  '@slipsurge/core/mlb-api': `export const getMLBGameFeed = async id => {
    globalThis.scoreFixture.sourceCalls.push(id); return globalThis.scoreFixture.mlb;
  }; export const mlbTeamLogo = id => "logo:" + id; export const mlbHeadshot = id => "headshot:" + id;`,
}
const bundle = await build({
  stdin: { contents: `export * as Route from './src/app/api/mobile/scores/resolve/route';
    export * from './src/lib/nativeMlbGameCenter';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', tsconfig: 'tsconfig.json',
  plugins: [{ name: 'native-score-links', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/lib/nativeMlbGameCenter') & { Route: typeof import('../src/app/api/mobile/scores/resolve/route') } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const get = (query: string) => module.exports.Route.GET(new Request(`https://fixture.invalid/api/mobile/scores/resolve?${query}`))

test('score links preserve the exact game and Eastern slate date', async () => {
  const response = await get('sport=nba&id=9')
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.date, '2026-11-25')
  assert.equal(result.game.id, '9')
  assert.equal(result.game.away.color, 'b01122')
  assert.equal(result.game.home.score, null)
  assert.equal((await get('sport=nba&id=10')).status, 404)
  assert.equal((await get('sport=nba&id=9&id=10')).status, 400)
})

test('MLB links and score data stay disabled during hibernation', async () => {
  assert.equal((await get('sport=mlb&id=42')).status, 404)
  assert.equal(await module.exports.loadNativeMlbGame('42', '2026-11-25'), null)
})

test('official MLB data preserves inning, batting, pitch and reaction identities', () => {
  const data = module.exports.projectNativeMlbGame(mlb)
  assert.equal(data.summary.header.id, '42')
  assert.equal(data.complete, true)
  assert.deepEqual(data.quarters[0].periods, [1])
  assert.equal(data.summary.plays?.[0].id, '0')
  assert.equal(data.summary.plays?.[0].team?.id, '147')
  assert.equal(data.summary.plays?.[0].athletes?.[1].athlete.headshot?.href, 'headshot:20')
  assert.deepEqual(data.summary.boxscore?.players?.[0].statistics[0].athletes[0].stats.slice(0, 3), ['2', '—', '1'])
  assert.equal(data.pitches.get('0')?.[0].speed, 95.7)
  assert.equal(data.pitches.get('0')?.[0].x, 0.2)
})


test('mobile live reads shorten upstream revalidation while default readers keep existing caching', async () => {
  const original = globalThis.fetch
  const requests: { url: string; revalidate: number | undefined; agent: string | null }[] = []
  globalThis.fetch = async (input, init) => {
    const revalidate = init?.next?.revalidate
    requests.push({ url: String(input), revalidate: typeof revalidate === 'number' ? revalidate : undefined,
      agent: new Headers(init?.headers).get('user-agent') })
    return Response.json({ events: [] })
  }
  try {
    await getScoreboard('nba', '2026-11-25')
    await getScoreboard('nba', '2026-11-25', 'live')
    await getGameSummary('nba', '401909317')
    await getGameSummary('nba', '401909317', 'live')
  } finally {
    globalThis.fetch = original
  }
  assert.deepEqual(requests.map(request => request.revalidate), [30, 2, 20, 2])
  assert.notEqual(requests[0]?.agent, requests[1]?.agent)
  assert.notEqual(requests[2]?.agent, requests[3]?.agent)
  assert.equal(requests[0]?.url, requests[1]?.url)
  assert.equal(requests[2]?.url, requests[3]?.url)
})
