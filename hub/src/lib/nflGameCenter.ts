import type { ESPNGame, ESPNPlay, ESPNSummary } from '@slipsurge/core/espn-api'

type Row = Record<string, unknown>
type Team = { id?: number; abbreviation: string }
export type NflCenterStat = Row & {
  game?: { id: number }
  player: { id: number; first_name: string; last_name: string; position_abbreviation?: string; headshot_url?: string }
  team: Team
}
export type NflCenterPlay = Row & {
  id: string | number; game?: { id: number }; period?: number; clock_display?: string
  wallclock?: string; sequence_number?: number; text?: string; type_text?: string; type_slug?: string
  scoring_play?: boolean; score_value?: number; away_score?: number; home_score?: number
  team?: Team; participants?: { player_id?: number }[]
}
export type NflCenterFeed = {
  game?: Row & { id: number; status_state?: string }
  stats?: NflCenterStat[]
  plays?: NflCenterPlay[]
}
export type NflQuarterRow = { team: string; logo: string; periods: (number | null)[]; total: string }
export const canonicalNflTeam = (abbr: string) => ({ LA: 'LAR', STL: 'LAR', WAS: 'WSH', JAC: 'JAX', SD: 'LAC', OAK: 'LV' }[abbr] ?? abbr)
const number = (value: unknown) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const display = (value: unknown) => number(value) == null ? '—' : String(value)

const GROUPS = [
  { name: 'Passing', activity: ['passing_attempts'], fields: ['passing_completions', 'passing_attempts', 'passing_yards', 'passing_touchdowns', 'passing_interceptions'], labels: ['CMP', 'ATT', 'YDS', 'TD', 'INT'] },
  { name: 'Rushing', activity: ['rushing_attempts'], fields: ['rushing_attempts', 'rushing_yards', 'long_rushing', 'rushing_touchdowns'], labels: ['CAR', 'YDS', 'LNG', 'TD'] },
  { name: 'Receiving', activity: ['receiving_targets', 'receptions'], fields: ['receptions', 'receiving_targets', 'receiving_yards', 'long_reception', 'receiving_touchdowns'], labels: ['REC', 'TGT', 'YDS', 'LNG', 'TD'] },
  { name: 'Kicking', activity: ['field_goals_attempted', 'extra_points_attempted'], fields: ['field_goals_made', 'field_goals_attempted', 'extra_points_made', 'extra_points_attempted'], labels: ['FGM', 'FGA', 'XPM', 'XPA'] },
] as const

/** Presentation adapter only. Missing observations stay missing, not zero. */
export function buildNflGameCenter(game: ESPNGame, feed: NflCenterFeed | null) {
  const competitors = game.competitions[0].competitors
  const providerId = Number(game.competitions[0].id)
  const validFeed = feed?.game?.id === providerId ? feed : null
  const stats = (validFeed?.stats ?? []).filter(row => row.game?.id === providerId && row.player && row.team)
  const teamFor = (abbr: string) => competitors.find(c => canonicalNflTeam(c.team.abbreviation) === canonicalNflTeam(abbr))
  const athlete = (row: NflCenterStat) => ({
    id: String(row.player.id), displayName: `${row.player.first_name} ${row.player.last_name}`.trim(),
    position: { abbreviation: row.player.position_abbreviation },
    ...(row.player.headshot_url ? { headshot: { href: row.player.headshot_url } } : {}),
  })
  const seen = new Set<string>()
  const ordered = (validFeed?.plays ?? []).filter(play => {
    if (play.game?.id !== providerId || seen.has(String(play.id))) return false
    seen.add(String(play.id)); return true
  }).sort((a, b) => {
    if (a.sequence_number != null && b.sequence_number != null) return a.sequence_number - b.sequence_number
    const at = Date.parse(a.wallclock ?? ''), bt = Date.parse(b.wallclock ?? '')
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
  })
  const plays: ESPNPlay[] = ordered.map((play, i) => ({
    id: String(play.id), sequenceNumber: String(i),
    type: { id: play.type_slug ?? '', text: play.type_text ?? 'Play' },
    text: play.text ?? '', awayScore: number(play.away_score) ?? 0, homeScore: number(play.home_score) ?? 0,
    scoringPlay: play.scoring_play === true, scoreValue: play.score_value,
    period: { number: play.period ?? 0, displayValue: (play.period ?? 0) > 4 ? 'OT' : `Q${play.period ?? ''}` },
    clock: { displayValue: play.clock_display ?? '' },
    ...(play.team && teamFor(play.team.abbreviation) ? { team: { id: teamFor(play.team.abbreviation)!.team.id } } : {}),
    athletes: (play.participants ?? []).flatMap(participant => {
      const row = stats.find(stat => stat.player.id === participant.player_id)
      return row ? [{ athlete: athlete(row) }] : []
    }),
  }))
  const latest = ordered.at(-1)
  const summary: ESPNSummary = {
    header: { id: game.id, competitions: [{
      competitors, venue: game.competitions[0].venue,
      status: { ...game.status, period: latest?.period ?? game.status.period,
        displayClock: latest?.clock_display ?? game.status.displayClock },
    }] },
    plays,
    ...(stats.length ? { boxscore: {
      teams: competitors.map(c => ({ team: c.team, statistics: [] })),
      players: competitors.map(c => ({ team: c.team, statistics: GROUPS.flatMap(group => {
        const rows = stats.filter(row => canonicalNflTeam(row.team.abbreviation) === canonicalNflTeam(c.team.abbreviation)
          && group.activity.some(field => (number(row[field]) ?? 0) > 0))
        return rows.length ? [{ name: group.name, keys: [...group.fields], labels: [...group.labels],
          athletes: rows.map(row => ({ athlete: athlete(row), stats: group.fields.map(field => display(row[field])) })) }] : []
      }) })),
    } } : {}),
  }
  const hasOt = (latest?.period ?? 0) > 4 || /\bOT\b/i.test(game.status.type.detail) || competitors.some(c => (number(validFeed?.game?.[`${c.homeAway === 'away' ? 'visitor' : 'home'}_team_ot`]) ?? 0) > 0)
  const quarters: NflQuarterRow[] = competitors.map(c => {
    const prefix = c.homeAway === 'away' ? 'visitor' : 'home'
    return { team: c.team.abbreviation, logo: c.team.logo, total: c.score,
      periods: ['q1', 'q2', 'q3', 'q4', ...(hasOt ? ['ot'] : [])].map(q => number(validFeed?.game?.[`${prefix}_team_${q}`])) }
  })
  return { summary, quarters }
}
