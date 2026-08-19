import type { TodayGame } from '@slipsurge/core/mlbSchedule'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeGameMechanicsWindows,
  HR_MECHANICS_MODEL_VERSION,
  MECHANICS_WINDOWS,
  type GameMechanicsResult,
  type GameMechanicsWindows,
  type MechanicsWindow,
} from '@/lib/hrMechanics'
import { assertMechanicsStatcastReady } from '@/lib/statcastMechanicsReadiness'

export type CompactMechanicsScore = {
  index: number
  rank: number
  confidence: number
  trend: number
}

export type CompactMechanicsWindows = Partial<Record<`l${MechanicsWindow}`, CompactMechanicsScore>>

type SnapshotRow = {
  window_games: number
  lineup_signature: string
  payload: GameMechanicsResult
  computed_at: string
}

const inFlight = new Map<string, Promise<{ results: GameMechanicsWindows; cache: 'miss' | 'refresh' }>>()

export function mechanicsLineupSignature(game: Pick<TodayGame,
  'awayPitcher' | 'homePitcher' | 'awayLineupConfirmed' | 'homeLineupConfirmed' | 'awayLineup' | 'homeLineup'
>) {
  return [
    game.awayPitcher?.id ?? 0,
    game.homePitcher?.id ?? 0,
    Number(game.awayLineupConfirmed),
    Number(game.homeLineupConfirmed),
    ...game.awayLineup.slice(0, 9).map(player => player.mlb_id),
    ...game.homeLineup.slice(0, 9).map(player => player.mlb_id),
  ].join(':')
}

function rowsToWindows(rows: SnapshotRow[]): GameMechanicsWindows | null {
  const byWindow = new Map(rows.map(row => [Number(row.window_games), row.payload]))
  if (!MECHANICS_WINDOWS.every(window => byWindow.has(window))) return null
  return Object.fromEntries(MECHANICS_WINDOWS.map(window => [window, byWindow.get(window)!])) as GameMechanicsWindows
}

export function compactMechanicsByPlayer(results: GameMechanicsWindows): Record<number, CompactMechanicsWindows> {
  const players: Record<number, CompactMechanicsWindows> = {}
  for (const window of MECHANICS_WINDOWS) {
    for (const player of results[window].players) {
      players[player.playerId] ??= {}
      players[player.playerId][`l${window}`] = {
        index: player.scores.overall,
        rank: player.rank,
        confidence: player.scores.confidence,
        trend: player.scores.trend,
      }
    }
  }
  return players
}

// Canonical snapshot service for Research, The Dugout, cron precompute and
// confirmed-lineup refreshes. A valid cache entry requires all four windows
// and the exact ordered 18-player/pitcher signature. Concurrent first loads
// share one promise so a busy slate cannot stampede the pitch-log source.
export async function getGameMechanicsWindows(
  game: TodayGame,
  gameDate: string,
  options: { force?: boolean; verifySources?: boolean } = {},
): Promise<{ results: GameMechanicsWindows; cache: 'hit' | 'miss' | 'refresh' }> {
  const admin = createAdminClient()
  const lineupSignature = mechanicsLineupSignature(game)
  const { data, error } = await admin
    .from('research_mechanics_snapshots')
    .select('window_games,lineup_signature,payload,computed_at')
    .eq('game_date', gameDate)
    .eq('game_pk', game.gamePk)
    .eq('model_version', HR_MECHANICS_MODEL_VERSION)
  if (error) throw error

  const rows = (data ?? []) as SnapshotRow[]
  const matchingRows = rows.filter(row => row.lineup_signature === lineupSignature)
  const cached = rowsToWindows(matchingRows)
  const readiness = options.verifySources === false
    ? null
    : await assertMechanicsStatcastReady(game, gameDate)
  const freshnessBoundary = readiness?.freshnessBoundary ? new Date(readiness.freshnessBoundary).getTime() : null
  const cacheIsFresh = freshnessBoundary == null || matchingRows.every(row => new Date(row.computed_at).getTime() >= freshnessBoundary)
  if (cached && cacheIsFresh && !options.force) return { results: cached, cache: 'hit' }

  const key = `${gameDate}:${game.gamePk}:${lineupSignature}:${HR_MECHANICS_MODEL_VERSION}`
  const active = inFlight.get(key)
  if (active) return active

  const computation = (async () => {
    const results = await computeGameMechanicsWindows(game, gameDate)
    const computedAt = new Date().toISOString()
    const payload = MECHANICS_WINDOWS.map(window => ({
      game_date: gameDate,
      game_pk: game.gamePk,
      window_games: window,
      model_version: HR_MECHANICS_MODEL_VERSION,
      lineup_signature: lineupSignature,
      payload: results[window],
      computed_at: computedAt,
    }))
    const { error: writeError } = await admin.from('research_mechanics_snapshots').upsert(payload, {
      onConflict: 'game_date,game_pk,window_games,model_version',
    })
    if (writeError) throw writeError
    return { results, cache: (rows.length ? 'refresh' : 'miss') as 'refresh' | 'miss' }
  })()

  inFlight.set(key, computation)
  try {
    return await computation
  } finally {
    inFlight.delete(key)
  }
}
