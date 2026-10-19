import 'server-only'
import { bdlHeaders } from './balldontlie'
import { createAdminClient } from './supabase/admin'
import { nbaToday } from './nbaPaint'

type Row = Record<string, unknown>
type State = { key: string; endpoint: string; season: number | null; cursor: number | null; complete: boolean; pages: number; rows_seen: number }
const record = (value: unknown): Row => value && typeof value === 'object' ? value as Row : {}
const id = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
export function nbaFact(kind: string, row: Row, season: number | null, fetchedAt: string): Row {
  const base = { id: id(row.id), payload: row, fetched_at: fetchedAt }
  if (!base.id) throw new Error('NBA fact missing identity')
  if (kind === 'teams') return base
  if (kind === 'players') return { ...base, team_id: id(record(row.team).id) }
  const game = kind === 'games' ? row : record(row.game), player = record(row.player), team = record(row.team)
  const gameSeason = Number(game.season ?? season), date = String(game.date ?? '').slice(0, 10)
  if (!Number.isInteger(gameSeason) || gameSeason < 1946 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('NBA fact missing season/date')
  if (kind === 'games') {
    const home = id(record(row.home_team).id), away = id(record(row.visitor_team).id)
    if (!home || !away || home === away) throw new Error('NBA game teams invalid')
    return { ...base, season: gameSeason, game_date: date, home_team_id: home, visitor_team_id: away, postseason: game.postseason === true }
  }
  if (!id(player.id) || !id(game.id)) throw new Error('NBA stat identity invalid')
  if (kind === 'advanced') return { ...base, player_id: player.id, game_id: game.id, season: gameSeason }
  if (!id(team.id)) throw new Error('NBA stat historical team missing')
  return { ...base, player_id: player.id, game_id: game.id, team_id: team.id, season: gameSeason, game_date: date, postseason: game.postseason === true, position: player.position ?? null }
}
export async function seedNbaIngestion() {
  const admin = createAdminClient()
  const today = nbaToday(), date = new Date(`${today}T12:00:00Z`), season = date.getUTCMonth() < 6 ? date.getUTCFullYear() - 1 : date.getUTCFullYear()
  const start = new Date(date); start.setUTCDate(start.getUTCDate() - 3)
  const end = new Date(date); end.setUTCDate(end.getUTCDate() + 14)
  const jobs = [
    { key: 'teams', endpoint: '/v1/teams?per_page=100', season: null },
    { key: 'players', endpoint: '/v1/players/active?per_page=100', season: null },
    { key: `games:recent:${season}`, endpoint: `/v1/games?seasons[]=${season}&season_type=regular&start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}&per_page=100`, season },
    { key: `stats:recent:${season}`, endpoint: `/v1/stats?seasons[]=${season}&season_type=regular&start_date=${start.toISOString().slice(0, 10)}&end_date=${today}&per_page=100`, season },
    { key: `advanced:recent:${season}`, endpoint: `/nba/v2/stats/advanced?seasons[]=${season}&start_date=${start.toISOString().slice(0, 10)}&end_date=${today}&period=0&per_page=100`, season },
    ...[season, season-1, season-2, season-3].map(season => ({ key: `games:${season}`, endpoint: `/v1/games?seasons[]=${season}&season_type=regular&per_page=100`, season })),
    ...[season-1, season-2, season-3, season].map(season => ({ key: `stats:${season}`, endpoint: `/v1/stats?seasons[]=${season}&season_type=regular&per_page=100`, season })),
    ...[season-1, season-2, season-3, season].map(season => ({ key: `advanced:${season}`, endpoint: `/nba/v2/stats/advanced?seasons[]=${season}&period=0&per_page=100`, season })),
  ]
  const { error } = await admin.from('nba_ingestion_state').upsert(jobs, { onConflict: 'key', ignoreDuplicates: true })
  if (error) throw new Error('NBA import queue unavailable')
  // Refresh only completed rolling scans. An unfinished scan retains its exact
  // endpoint/date range and cursor until completion, even across midnight.
  const rolling = jobs.filter(job => job.key.includes(':recent:') || job.key === 'players' || job.key === 'teams')
  const { data: existing, error: rollingError } = await admin.from('nba_ingestion_state').select('key,complete,updated_at').in('key', rolling.map(job => job.key))
  if (rollingError) throw new Error('NBA rolling coverage unavailable')
  for (const state of existing ?? []) {
    const cadence = state.key === 'teams' ? 86400000 : state.key === 'players' ? 21600000 : 900000
    if (!state.complete || state.updated_at && Date.now() - Date.parse(state.updated_at) < cadence) continue
    const job = rolling.find(job => job.key === state.key)!
    const { error: resetError } = await admin.from('nba_ingestion_state').update({ endpoint: job.endpoint, cursor: null, complete: false, pages: 0, rows_seen: 0, last_error: null }).eq('key', state.key).eq('complete', true)
    if (resetError) throw new Error('NBA rolling refresh could not queue')
  }
  return jobs.map(job => job.key)
}
export async function runNbaIngestion(budgetMs = 42000) {
  const admin = createAdminClient(), started = Date.now(), keys = await seedNbaIngestion()
  const { data, error } = await admin.from('nba_ingestion_state').select('*').eq('complete', false)
  if (error) throw new Error('NBA import state unavailable')
  const states = (data as State[]).sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key))
  let pages = 0, rows = 0
  for (const state of states) {
    const kind = state.key.split(':')[0], table = { teams: 'nba_teams', players: 'nba_players', games: 'nba_games', stats: 'nba_player_game_stats', advanced: 'nba_advanced_game_stats' }[kind]
    if (!table) continue
    while (Date.now() - started < budgetMs && !state.complete && pages < 30) {
      try {
        const response = await fetch(`https://api.balldontlie.io${state.endpoint}${state.cursor == null ? '' : `&cursor=${state.cursor}`}`, { headers: bdlHeaders, cache: 'no-store', signal: AbortSignal.timeout(12000) })
        if (!response.ok) throw new Error(`NBA import provider HTTP ${response.status}`)
        const body = await response.json() as { data: Row[]; meta?: { next_cursor?: number | null } }
        if (!Array.isArray(body.data)) throw new Error('NBA import payload invalid')
        const fetchedAt = new Date().toISOString(), facts = body.data.map(row => nbaFact(kind, row, state.season, fetchedAt))
        if (facts.length) {
          const { error: writeError } = await admin.from(table).upsert(facts, { onConflict: 'id' })
          if (writeError) throw new Error(`NBA ${kind} write failed (${writeError.code})`)
        }
        const next = body.meta?.next_cursor ?? null
        if (next != null && (!Number.isSafeInteger(next) || next === state.cursor)) throw new Error('NBA import cursor did not advance')
        state.cursor = next; state.complete = next == null; state.pages++; state.rows_seen += facts.length; pages++; rows += facts.length
        const { error: stateError } = await admin.from('nba_ingestion_state').update({ cursor: next, complete: state.complete, pages: state.pages, rows_seen: state.rows_seen, updated_at: fetchedAt, last_error: null }).eq('key', state.key)
        if (stateError) throw new Error('NBA cursor save failed')
      } catch (failure) {
        await admin.from('nba_ingestion_state').update({ last_error: failure instanceof Error ? failure.message : 'NBA import failed', updated_at: new Date().toISOString() }).eq('key', state.key)
        throw failure
      }
    }
    if (Date.now() - started >= budgetMs || pages >= 30) break
  }
  return { pages, rows, remaining: states.filter(state => !state.complete).map(state => state.key) }
}
