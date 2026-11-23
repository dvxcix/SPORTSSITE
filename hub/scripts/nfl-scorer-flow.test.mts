import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { makeLens, makeNflOdds, nflGames } from '../review/nfl'
import * as scoring from '../src/lib/nflContextScore'
import * as math from '../src/lib/nflMarketMath'
import * as primary from '../src/lib/nflPrimaryMarket'
import * as availability from '../src/lib/nflAvailability'
import * as integrity from '../src/lib/nflScoreIntegrity'
import * as pause from '../src/lib/browserbaseSpendingPause'
import * as names from '../src/lib/nflPlayerName'
import * as sample from '../src/lib/nflSample'
import * as markets from '../src/lib/nflSlateEdge'

test('the actual slate loader excludes passing-only changes from scorer scores', async () => {
  const lens = makeLens(), board = makeNflOdds(), game = nflGames[0]
  const qb = lens.windows.season.players.find(player => player.name === 'Josh Allen')!
  Object.assign(qb, { targetShare: 0, carryShare: 20, passingTouchdowns: 20,
    volume: 100, dvp: { passing_tds: -25, rushing_tds: 0 } })
  const imports: Record<string, unknown> = {
    'server-only': {}, 'next/cache': { unstable_cache: (fn: unknown) => fn },
    './nflPregameResearchData': { NflPregameResearchUnavailable: Error },
    '@/lib/nflMarketMath': math, '@/lib/nflContextScore': scoring,
    '@/lib/nflPrimaryMarket': primary, '@/lib/nflAvailability': availability,
    '@/lib/nflScoreIntegrity': integrity, '@/lib/browserbaseSpendingPause': pause,
    '@/lib/nflWatchlist': { nflWatchlistSelection: () => null },
    '@/lib/nflPlayerName': names, '@/lib/nflSample': sample, '@/lib/nflSlateEdge': markets,
    '@/app/the-sideline/data': { getSidelineOddsBundle: async () => ({ odds: board }),
      getCachedSidelineBoardLens: async () => lens },
  }
  const source = readFileSync('src/lib/nflSlateData.ts', 'utf8') + '\nexports.scorerTestLoad = loadGameEntries\n'
  const api: Record<string, (...args: unknown[]) => Promise<any>> = {}
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS } }).outputText, { exports: api, console,
    require: (id: string) => { assert.ok(id in imports, id); return imports[id] } })
  const load = async () => (await api.scorerTestLoad(game, 'regular')).value.entries.find((entry: any) => entry.id === qb.id)
  const original = await load()
  assert.ok(original)
  assert.equal(original.score.anytime_td, scoring.contextualNflScore({ ...qb,
    teamProfile: lens.windows.season.teams.find(team => team.team.abbr === qb.team),
    opponentProfile: lens.windows.season.teams.find(team => team.team.abbr !== qb.team),
  }, 'anytime_td', math.americanImpliedProbability(board.gameLines[0].moneylineAway), board.gameLines[0].total).score)
  Object.assign(qb, { passingTouchdowns: 35, passAttempts: 500, volume: 0,
    dvp: { passing_tds: 25, rushing_tds: 0 } })
  const passingOnly = await load()
  assert.equal(passingOnly.score.anytime_td, original.score.anytime_td)
  assert.equal(passingOnly.score.first_td, original.score.first_td)
  qb.carryShare = 0
  assert.ok((await load()).score.anytime_td < original.score.anytime_td)
})
