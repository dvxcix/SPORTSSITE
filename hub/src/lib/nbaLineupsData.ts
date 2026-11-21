import 'server-only'
import { createAdminClient } from './supabase/admin'
import { getPaintActualLineups, getPaintProjectedLineups } from './nbaPaintData'
import { getNbaOddsGame } from './nbaOddsClockData'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaGameStart, nbaPregameOpen, type NbaOddsMode } from './nbaOddsMode'
import { nbaActualLineups, nbaArchivedLineup, nbaPregameLineups, type NbaGameLineups } from './nbaLineups'
import type { PaintGame } from './nbaPaint'

export async function getNbaGameLineups(input: PaintGame, mode: NbaOddsMode): Promise<NbaGameLineups> {
  const game = await getNbaOddsGame(input), cutoff = nbaGameStart(game)
  if (cutoff == null) throw new Error('Verified game clock required')
  const open = nbaPregameOpen(game), ttl = mode === 'live' || open ? 30 : 3600
  const result = await nbaSharedCache(`game-lineups:v1:${mode}:${game.id}:${cutoff}:${open}`, ttl, 0, async () => {
    const admin = createAdminClient(), now = Date.now()
    const archived = await Promise.all([game.visitor_team.id, game.home_team.id].map(async teamId => {
      const { data, error } = await admin.from('nba_pregame_lineup_observations').select('game_id,team_id,source_updated_at,cutoff_at,payload')
        .eq('game_id', game.id).eq('team_id', teamId).lt('source_updated_at', new Date(cutoff).toISOString())
        .order('source_updated_at', { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(8000)).maybeSingle()
      if (error) throw new Error('Saved lineups unavailable')
      return nbaArchivedLineup(data, game, teamId, now)
    }))
    const [projection, actual] = await Promise.allSettled([
      getPaintProjectedLineups(game.id),
      mode === 'live' && !open ? getPaintActualLineups(game.id) : Promise.resolve([]),
    ])
    const checked = Date.now(), projected = projection.status === 'fulfilled' ? nbaPregameLineups(projection.value, game, checked) : []
    const rawRows = projection.status === 'fulfilled' && Array.isArray(projection.value) ? projection.value : []
    let saved = true
    if (projected.length) {
      const entries = projected.map(team => ({ game_id: game.id, team_id: team.teamId, source_id: team.sourceId,
        source_updated_at: team.observedAt, cutoff_at: new Date(cutoff).toISOString(), status: team.status,
        payload: rawRows.find(value => !!value && typeof value === 'object' && (value as Record<string, unknown>).id === team.sourceId && (value as Record<string, unknown>).team_id === team.teamId && Date.parse(String((value as Record<string, unknown>).updated_at)) === Date.parse(team.observedAt)),
      }))
      const { error } = await admin.from('nba_pregame_lineup_observations').upsert(entries, { onConflict: 'game_id,team_id,source_updated_at', ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(8000))
      saved = !error
    }
    const pregame = archived.flatMap(team => team ? [team] : [])
    if (saved) for (const team of projected) {
      const index = pregame.findIndex(row => row.teamId === team.teamId)
      if (index < 0) pregame.push(team)
      else if (Date.parse(team.observedAt) > Date.parse(pregame[index].observedAt)) pregame[index] = team
    }
    const actualTeams = mode === 'live' && actual.status === 'fulfilled' ? nbaActualLineups(actual.value, game, checked) : []
    const teams = [game.visitor_team.id, game.home_team.id].flatMap(teamId => {
      const value = actualTeams.find(row => row.teamId === teamId) ?? pregame.find(row => row.teamId === teamId)
      return value ? [value] : []
    })
    return { gameId: game.id, mode, cutoffAt: new Date(cutoff).toISOString(), checkedAt: new Date(checked).toISOString(), teams, unavailable: !saved || projection.status === 'rejected' || mode === 'live' && !open && actual.status === 'rejected' } satisfies NbaGameLineups
  }, 45)
  // A newly learned earlier actual tip can only tighten this response.
  const latest = await getNbaOddsGame(game), latestCutoff = Math.min(cutoff, nbaGameStart(latest) ?? cutoff)
  return { ...result.value, cutoffAt: new Date(latestCutoff).toISOString(), teams: result.value.teams.filter(team => team.source === 'game' ? mode === 'live' : Date.parse(team.observedAt) < latestCutoff) }
}
