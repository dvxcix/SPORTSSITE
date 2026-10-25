import 'server-only'
import { createAdminClient } from './supabase/admin'
import { getPaintFinalStats, getPaintGame, getPaintProfile, getPaintScouting } from './nbaPaintData'
import { getNbaDefenseContext } from './nbaIntelligenceData'
import { getNbaTracking } from './nbaTrackingData'
import { getNbaMarketContext } from './nbaMarketSignalData'
import { getNbaPlays } from './nbaShotsData'
import { nbaFirstBasketResearch, nbaOpeningSequence } from './nbaFirstBasket'
import { nbaShots, type NbaPlay } from './nbaShots'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaPregameResearch, readNbaPregameResearch, NbaPregameResearchUnavailable } from './nbaPregameResearchData'
import type { NbaOddsMode } from './nbaOddsMode'
import type { NbaModelReport } from './nbaModel'
import type { PaintBoard } from './nbaPaint'

type Observation<T> = { value: T; observedAt: string }
/** All callers share the same game-scoped input, independently of selections,
 * sportsbook, user matrices, or which page first requested it. */
async function resource<T>(board: PaintBoard, key: string, mode: NbaOddsMode, load: () => Promise<Observation<T>>, complete?: (value: T) => boolean) {
  if (mode === 'live') return { ...await load(), frozen: false, source: 'capture' as const }
  return nbaPregameResearch(board.game, key, async () => {
    const entry = await load()
    if (complete && !complete(entry.value)) {
      const prior = await readNbaPregameResearch<T>(board.game, key)
      if (prior && complete(prior.value)) throw new Error('Incomplete research refresh; retain the saved complete observation')
    }
    return entry
  })
}

export async function getNbaResearchDefense(board: PaintBoard, mode: NbaOddsMode = 'pregame') {
  const saved = await resource(board, 'defense:v1', mode, async () => {
    const value = await getNbaDefenseContext(board.sampleSeason, board.game.date)
    return { value, observedAt: value.fetchedAt ?? new Date().toISOString() }
  }, value => value.ready)
  return { ...saved.value, fetchedAt: saved.observedAt, researchSnapshot: { observedAt: saved.observedAt, source: saved.source, frozen: saved.frozen } }
}

export async function getNbaResearchTracking(board: PaintBoard, mode: NbaOddsMode = 'pregame') {
  const saved = await resource(board, 'tracking:v1', mode, async () => {
    const value = await getNbaTracking(board)
    return { value, observedAt: value.fetchedAt }
  }, value => value.complete)
  return { ...saved.value, fetchedAt: saved.observedAt, researchSnapshot: { observedAt: saved.observedAt, source: saved.source, frozen: saved.frozen } }
}

export async function getNbaResearchMarketContext(board: PaintBoard, mode: NbaOddsMode = 'pregame') {
  const saved = await resource(board, 'market-context:v1', mode, async () => {
    const value = await getNbaMarketContext(board.game, undefined, mode)
    return { value, observedAt: value.asOf }
  })
  return saved.value
}

export async function getNbaResearchModels(board: PaintBoard, mode: NbaOddsMode = 'pregame'): Promise<NbaModelReport[]> {
  try {
    const saved = await resource(board, 'models:v1', mode, async () => {
      const cached = await nbaSharedCache('validated-models:v1', 300, 300, async () => {
        const { data, error } = await createAdminClient().from('nba_model_reports').select('report').eq('version', 'nba-rolling-v1').order('validation_season', { ascending: false }).limit(48).abortSignal(AbortSignal.timeout(12_000))
        if (error) throw new Error('NBA projection unavailable')
        return (data ?? []).map(row => row.report as NbaModelReport)
      })
      return { value: cached.value.filter(report => report.validationThrough < board.game.date), observedAt: cached.fetchedAt }
    })
    return saved.value
  } catch (error) {
    // An old recovered board can still show its MM/logs without a model that
    // was never captured. No current model may substitute for that missing input.
    if (error instanceof NbaPregameResearchUnavailable) return []
    throw error
  }
}

export async function getNbaResearchProfiles(board: PaintBoard, mode: NbaOddsMode = 'pregame') {
  const saved = await resource(board, 'profiles:v1', mode, async () => {
    const cached = await nbaSharedCache(`research-profiles:v1:${mode}:${board.game.id}:${board.sampleSeason}`, 900, 3600, async () => {
      const players: { playerId: number; profile: Awaited<ReturnType<typeof getPaintProfile>> }[] = []
      // Bound provider concurrency while capturing the entire matchup, not only
      // whichever player happened to have a drawer open before tipoff.
      for (let offset = 0; offset < board.players.length; offset += 6) {
        players.push(...await Promise.all(board.players.slice(offset, offset + 6).map(async player => ({ playerId: player.id, profile: await getPaintProfile(player.id, board.sampleSeason) }))))
      }
      return { gameId: board.game.id, season: board.sampleSeason, players, complete: players.length === board.players.length && players.every(row => row.profile.shooting != null && row.profile.advanced != null) }
    }, 100)
    return { value: cached.value, observedAt: cached.fetchedAt }
  }, value => value.complete === true)
  return { ...saved.value, fetchedAt: saved.observedAt, researchSnapshot: { observedAt: saved.observedAt, source: saved.source, frozen: saved.frozen } }
}

export async function getNbaResearchFirstBasket(board: PaintBoard, mode: NbaOddsMode = 'pregame') {
  const saved = await resource(board, 'first-basket:v1', mode, async () => {
    const cached = await nbaSharedCache(`first-basket-research:v4:${mode}:${board.game.id}`, 60, 86400, async () => {
      const started = Date.now()
      const gameIds = [...new Set([board.game.home_team.id, board.game.visitor_team.id].flatMap(teamId => {
        const games = board.players.flatMap(player => player.logs).filter(log => log.team.id === teamId && log.game.date.slice(0, 10) < board.game.date && log.game.postseason !== true && (log.game.status_state === 'final' || log.game.status === 'Final'))
        return [...new Map(games.sort((a, b) => b.game.date.localeCompare(a.game.date)).map(log => [log.game.id, log])).keys()].slice(0, 10)
      }))]
      const { data, error } = gameIds.length ? await createAdminClient().from('nba_game_plays').select('game_id,payload').in('game_id', gameIds).eq('payload->>period', '1').order('game_id').order('play_order').limit(5000).abortSignal(AbortSignal.timeout(12_000)) : { data: [], error: null }
      if (error) throw new Error('Opening plays unavailable')
      const plays = (data ?? []).flatMap(row => { const play = row.payload as NbaPlay; return play.game_id === row.game_id ? [play] : [] })
      const missing = gameIds.filter(game => !nbaOpeningSequence(plays, game).firstFieldGoal)
      let failed = 0
      for (let offset = 0; offset < missing.length; offset += 4) {
        if (Date.now() - started > 90_000) { failed += missing.length - offset; break }
        await Promise.all(missing.slice(offset, offset + 4).map(async game => {
          try {
            const season = board.players.flatMap(player => player.logs).find(log => log.game.id === game)?.game.season ?? board.sampleSeason
            plays.push(...(await getNbaPlays(game, season)).value)
          } catch { failed++ }
        }))
      }
      return { ...nbaFirstBasketResearch(board, plays, gameIds), failed }
    }, 120)
    return { value: cached.value, observedAt: cached.fetchedAt }
  }, value => value.failed === 0 && value.requestedGames === value.coveredGames)
  return { ...saved.value, mode, fetchedAt: saved.observedAt, stale: false, researchSnapshot: { observedAt: saved.observedAt, source: saved.source, frozen: saved.frozen } }
}

/** playedGame is a prior appearance in this frozen matchup's logs. It is never
 * the matchup's eventual box score or a freely substituted future game. */
export async function getNbaResearchShots(board: PaintBoard, playedGame: number, playerId: number, mode: NbaOddsMode = 'pregame') {
  const player = board.players.find(candidate => candidate.id === playerId)
  const log = player?.logs.find(candidate => candidate.game.id === playedGame && candidate.game.date.slice(0, 10) < board.game.date && (candidate.game.status_state === 'final' || candidate.game.status === 'Final'))
  if (!log || (log.game.season ?? 0) < 2025) throw new Error('Shot appearance is outside this matchup sample')
  const saved = await resource(board, `shots:v1:${playedGame}:${playerId}`, mode, async () => {
    const match = await getPaintGame(playedGame)
    if (match.date >= board.game.date || (match.status_state !== 'final' && match.status !== 'Final')) throw new Error('Shot game is outside this matchup sample')
    const stats = await getPaintFinalStats(playedGame), row = stats.rows.find(stat => stat.game.id === playedGame && stat.player.id === playerId)
    if (!stats.complete || !row?.player.first_name || !row.player.last_name) throw new Error('Player appearance could not be verified')
    const source = await getNbaPlays(playedGame, match.season)
    const shots = nbaShots(source.value, playedGame, { id: playerId, first_name: row.player.first_name, last_name: row.player.last_name })
    return { value: { gameId: playedGame, playerId, shots, boxScoreAttempts: row.fga, coverageMatches: row.fga != null && shots.length === row.fga, stale: source.stale }, observedAt: new Date().toISOString() }
  }, value => value.coverageMatches)
  return { ...saved.value, fetchedAt: saved.observedAt, researchSnapshot: { observedAt: saved.observedAt, source: saved.source, frozen: saved.frozen } }
}

/** Existing research cron may warm these resources without replaying collectors.
 * Deadline skips are explicit; they are not saved as complete observations. */
export async function warmNbaResearchResources(board: PaintBoard, options: { deadline?: number } = {}) {
  const deadline = options.deadline ?? Date.now() + 115_000
  const jobs: { resource: string; budget: number; load: () => Promise<unknown> }[] = [
    { resource: 'defense', budget: 25_000, load: () => getNbaResearchDefense(board) },
    { resource: 'tracking', budget: 25_000, load: () => getNbaResearchTracking(board) },
    { resource: 'models', budget: 15_000, load: () => getNbaResearchModels(board) },
    { resource: 'market-context', budget: 25_000, load: () => getNbaResearchMarketContext(board) },
    { resource: 'scouting', budget: 35_000, load: () => getPaintScouting(board.game, 'pregame') },
    { resource: 'profiles', budget: 65_000, load: () => getNbaResearchProfiles(board) },
    { resource: 'first-basket', budget: 110_000, load: () => getNbaResearchFirstBasket(board) },
  ]
  return Promise.all(jobs.map(async job => {
    if (deadline - Date.now() < job.budget) return { resource: job.resource, status: 'deferred' as const }
    try { await job.load(); return { resource: job.resource, status: 'captured' as const } }
    catch { return { resource: job.resource, status: 'unavailable' as const } }
  }))
}
