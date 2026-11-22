import type { SidelineGame } from '@/app/the-sideline/types'
import { nflResultTeam, gradeNflPublicProp, type NflPublicResult } from './nflPublicResults'

export type NflBoardFinal = [gameId: string, playerId: number, team: string, value: number]
export type NflBoardResultQuote = readonly [string, number, string, string, string, string, string, number, ...unknown[]]
export type NflFinalFeed = { game_id: string; reconciled: boolean; fetched_at: string; game: {
  id: number; season: number; week: number; date: string; status_state: string
  visitor_team: { abbreviation: string }; home_team: { abbreviation: string }
  visitor_team_score: number; home_team_score: number
} | null }

/** Results are a separate, current layer. They never modify the pregame archive. */
export function verifiedNflBoardFinal(game: SidelineGame, feed: NflFinalFeed, now = Date.now()) {
  const row = feed?.game, start = Date.parse(row?.date ?? ''), seen = Date.parse(feed?.fetched_at ?? '')
  return !!row && feed.game_id === game.id && feed.reconciled === true && row.status_state === 'final'
    && Number.isSafeInteger(row.id) && row.id > 0 && row.season === game.season && row.week === game.week
    && Number.isFinite(start) && start <= now && Number.isFinite(seen) && seen >= start && seen <= now
    && new Date(start).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === game.gameday
    && nflResultTeam(row.visitor_team?.abbreviation ?? '') === nflResultTeam(game.away.abbr)
    && nflResultTeam(row.home_team?.abbreviation ?? '') === nflResultTeam(game.home.abbr)
    && game.awayScore != null && game.homeScore != null
    && row.visitor_team_score === game.awayScore && row.home_team_score === game.homeScore
}

export function nflBoardFinalValues(gameId: string, quotes: readonly NflBoardResultQuote[], result: NflPublicResult): NflBoardFinal[] {
  if (result.status !== 'final') return []
  const complete={...result,players:result.players.map(player=>({...player,stats:{...player.stats,passing_rushing_yards:player.stats.passing_yards!=null&&player.stats.rushing_yards!=null?player.stats.passing_yards+player.stats.rushing_yards:null}}))}
  const unique = new Map<string, NflBoardResultQuote>()
  for (const quote of quotes) if (quote[0] === gameId) unique.set(JSON.stringify([quote[1], quote[3]]), quote)
  return [...unique.values()].flatMap(q => {
    const grade = gradeNflPublicProp(complete, { id: q[1], name: q[2], team: q[3], position: q[4], markets: [] }, {
      propType: ['two_plus_td','three_plus_td'].includes(q[5]) ? 'anytime_td' : q[5], line: q[7], kind: 'milestone',
    })
    return grade.actual == null || !['hit', 'miss'].includes(grade.state) ? [] : [[gameId, q[1], q[3], grade.actual] as NflBoardFinal]
  })
}

/** Reject conflicting or foreign rows; zero is a real result, absence is not. */
export function nflBoardFinalMap(rows: unknown, quotes: readonly NflBoardResultQuote[]) {
  const wanted = new Set(quotes.map(q => JSON.stringify([q[0], q[1], q[3]])))
  const values = new Map<string, number | null>()
  if (!Array.isArray(rows) || rows.length > 3840) return values
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 4 || typeof row[0] !== 'string' || !Number.isSafeInteger(row[1]) || typeof row[2] !== 'string' || typeof row[3] !== 'number' || !Number.isFinite(row[3])) continue
    const key = JSON.stringify(row.slice(0, 3))
    if (!wanted.has(key)) continue
    values.set(key, values.has(key) && values.get(key) !== row[3] ? null : row[3])
  }
  return values
}
