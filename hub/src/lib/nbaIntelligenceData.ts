import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaDefenseProfiles } from './nbaIntelligence'
import { nbaMinutes, PAINT_MARKETS, type PaintGame, type PaintStat } from './nbaPaint'

class NbaDefenseCoverageError extends Error {}
export async function getNbaDefenseContext(season: number, before: string, allowFallback = true): Promise<{ ready: boolean; season: number; before: string; profiles: ReturnType<typeof nbaDefenseProfiles>; games: number; rows: number; fetchedAt: string | null; stale: boolean }> {
  const admin = createAdminClient()
  const { data: state, error: stateError } = await admin.from('nba_ingestion_state').select('complete,rows_seen,updated_at').eq('key', `stats:${season}`).maybeSingle()
  if (stateError) throw new Error('NBA history coverage unavailable')
  if (!state?.complete) {
    if (allowFallback && season >= 2025) { const previous = await getNbaDefenseContext(season - 1, before, false); if (previous.ready) return previous }
    return { ready: false, season, before, profiles: [], games: 0, rows: state?.rows_seen ?? 0, fetchedAt: state?.updated_at ?? null, stale: false }
  }
  try {
  const cached = await nbaSharedCache(`dvp:v2:${season}:${before}`, 3600, 3600, async () => {
    const { data: games, error } = await admin.from('nba_games').select('payload').eq('season', season).eq('postseason', false).lt('game_date', before).order('game_date', { ascending: false }).limit(1000)
    if (error) throw new Error('NBA defensive game coverage unavailable')
    const counts = new Map<number, number>(), ids = new Set<number>()
    for (const row of games ?? []) {
      const game = row.payload as PaintGame
      if (game.status_state !== 'final' && game.status !== 'Final') continue
      for (const team of [game.home_team.id, game.visitor_team.id]) {
        if ((counts.get(team) ?? 0) < 20) { counts.set(team, (counts.get(team) ?? 0) + 1); ids.add(game.id) }
      }
    }
    // Require all thirty teams; an early partial import cannot masquerade as league coverage.
    if (counts.size < 30 || [...counts.values()].some(count => count < 5)) throw new NbaDefenseCoverageError('NBA defensive history is still warming')
    const list = [...ids], stats: PaintStat[] = []
    for (let offset = 0; offset < list.length; offset += 60) {
      const batch = list.slice(offset, offset + 60)
      for (let page = 0; page < 5; page++) {
        const { data, error: readError } = await admin.from('nba_player_game_stats').select('payload').in('game_id', batch).order('id').range(page * 1000, page * 1000 + 999)
        if (readError) throw new Error('NBA defensive statistics unavailable')
        stats.push(...(data ?? []).map(row => row.payload as PaintStat))
        if ((data?.length ?? 0) < 1000) break
        if (page === 4) throw new Error('NBA defensive statistics truncated')
      }
    }
    // Each defense uses exactly its own most recent twenty games, even though
    // the shared query also fetched opponents' games from different windows.
    const allowed = new Map<number, Set<number>>()
    for (const row of games ?? []) {
      const game = row.payload as PaintGame
      if (game.status_state !== 'final' && game.status !== 'Final') continue
      for (const team of [game.home_team.id, game.visitor_team.id]) {
        const set = allowed.get(team) ?? new Set<number>()
        if (set.size < 20) set.add(game.id)
        allowed.set(team, set)
      }
    }
    const filtered = stats.filter(row => {
      const opponent = row.team.id === row.game.home_team_id ? row.game.visitor_team_id : row.game.home_team_id
      return allowed.get(opponent)?.has(row.game.id) && row.game.date.slice(0, 10) < before
    })
    return { profiles: nbaDefenseProfiles(filtered, PAINT_MARKETS.map(market => market.key)), games: ids.size, rows: filtered.filter(row => (nbaMinutes(row.min) ?? 0) > 0).length }
  })
  return { ready: true, season, before, ...cached.value, fetchedAt: cached.fetchedAt, stale: cached.stale }
  } catch (error) {
    if (error instanceof NbaDefenseCoverageError) {
      if (allowFallback && season >= 2025) return getNbaDefenseContext(season - 1, before, false)
      return { ready: false, season, before, profiles: [], games: 0, rows: state.rows_seen, fetchedAt: state.updated_at, stale: false }
    }
    throw error
  }
}
