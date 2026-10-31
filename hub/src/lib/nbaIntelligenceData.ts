import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaDefenseProfiles } from './nbaIntelligence'
import { nbaMinutes, PAINT_MARKETS, type PaintTeam, type PaintGame, type PaintStat } from './nbaPaint'

export async function getNbaDefenseContext(season: number, before: string): Promise<{ teams?: PaintTeam[]; ready: boolean; season: number; before: string; profiles: ReturnType<typeof nbaDefenseProfiles>; games: number; rows: number; quarterRows?: number; fetchedAt: string | null; stale: boolean }> {
  const admin = createAdminClient()
  // Coverage changes slowly. Reuse the existing cross-instance lease instead
  // of multiplying those reads by viewers.
  // Unlike historical profiles, coverage is never served beyond its short TTL.
  const coverage = (await nbaSharedCache(`dvp-coverage:v1:${season}`, 60, 0, async () => {
    const { data: state, error: stateError } = await admin.from('nba_ingestion_state').select('complete,rows_seen,updated_at').eq('key', `stats:${season}`).abortSignal(AbortSignal.timeout(12_000)).maybeSingle()
    if (stateError) throw new Error('NBA history coverage unavailable')
    if (!state?.complete) return { state, periodComplete: false }
    const { data: periodState, error: periodError } = await admin.from('nba_ingestion_state').select('complete').eq('key', `period1:${season}`).abortSignal(AbortSignal.timeout(12_000)).maybeSingle()
    if (periodError) throw new Error('NBA quarter coverage unavailable')
    return { state, periodComplete: periodState?.complete === true }
  })).value
  const { state, periodComplete } = coverage
  if (!state?.complete) {
    return { ready: false, season, before, profiles: [], games: 0, rows: state?.rows_seen ?? 0, fetchedAt: state?.updated_at ?? null, stale: false }
  }
  const cached = await nbaSharedCache(`dvp:v7:${season}:${before}:${periodComplete}`, 3600, 3600, async () => {
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
    // Use only the requested season. Sparse teams/positions remain visible in
    // their profile sample counts; a missing season never silently becomes the
    // previous one. If some teams are absent, expose observed profiles as
    // incomplete instead of hiding them or claiming full league coverage.
    if (!ids.size) return { ready: false, profiles: [], games: 0, rows: state.rows_seen }
    const list = [...ids], stats: PaintStat[] = []
    for (let offset = 0; offset < list.length; offset += 60) {
      const batch = list.slice(offset, offset + 60)
      for(const table of ['nba_player_game_stats',...(periodComplete?['nba_player_period_stats']:[])]) for (let page = 0; page < 5; page++) {
        const { data, error: readError } = await admin.from(table).select('payload').in('game_id', batch).order('id').range(page * 1000, page * 1000 + 999)
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
    const teams = [...new Map((games ?? []).flatMap(row => { const game = row.payload as PaintGame; return [game.home_team,game.visitor_team] }).map(team => [team.id,team])).values()]
    const expected = new Set<string>()
    for (const row of games ?? []) {
      const game = row.payload as PaintGame
      if (!ids.has(game.id)) continue
      if (allowed.get(game.home_team.id)?.has(game.id)) expected.add(`${game.id}:${game.visitor_team.id}`)
      if (allowed.get(game.visitor_team.id)?.has(game.id)) expected.add(`${game.id}:${game.home_team.id}`)
    }
    const full = filtered.filter(row => (row.period ?? 0) === 0 && (nbaMinutes(row.min) ?? 0) > 0)
    const seen = new Set(full.map(row => `${row.game.id}:${row.team.id}`))
    const profiles = nbaDefenseProfiles(filtered, PAINT_MARKETS.map(market => market.key))
    // A game record alone does not prove its box score was ingested. Keep any
    // partial profiles visible, but never mark missing game/side data complete.
    const ready = counts.size === 30 && expected.size > 0 && [...expected].every(key => seen.has(key)) && profiles.length > 0
    return { ready, teams, profiles, games: ids.size, rows: full.length, quarterRows: filtered.filter(row => row.period===1 && (nbaMinutes(row.min)??0)>0).length }
  })
  return { season, before, ...cached.value, fetchedAt: cached.fetchedAt, stale: cached.stale }
}
