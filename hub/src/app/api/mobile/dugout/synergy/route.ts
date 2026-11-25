import { NextResponse } from 'next/server'
import { GET as readSynergy } from '@/app/api/synergy/today/route'
import { mlbHeadshot, pitchColor, pitchLabel } from '@slipsurge/core/mlb-api'
import { getTeamLogoPngUrl, MLB_TEAM_COLORS, MLB_TEAM_NAMES, MLB_TEAM_SECONDARY_COLORS } from '@slipsurge/core/mlbTeamColors'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { requireTier } from '@/lib/requireTier'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 90
const headers = { 'Cache-Control': 'private, no-store' }
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })

type Evidence = {
  game_date: string; pitcher_id: number; batter_id: number; opponent_id: number; opponent_name: string; opponent_team: string | null;
  pitch_type: string | null; matchScore: number; velocity: number | null; spin_rate: number | null; launch_speed: number | null;
  launch_angle: number | null; hit_distance: number | null; xwoba: number | null; run_value: number | null;
}
type Game = { gameKey: string; awayAbbr: string; homeAbbr: string; gameDate: string | null; abstractStatus: string; awayScore: number | null; homeScore: number | null }
type Pair = { gameKey: string; lineupConfirmed: boolean; batterId: number; pitcherId: number; batterName: string; pitcherName: string;
  batterTeamAbbr: string; pitcherTeamAbbr: string; batterBats: string | null; pitcherHand: string;
  batterScore: number; pitcherScore: number; evidencePitchers: Evidence[]; evidenceHitters: Evidence[] }

function team(code: string, score?: number | null) {
  return { code, name: MLB_TEAM_NAMES[code] ?? code, score, logo: getTeamLogoPngUrl(code), primary: MLB_TEAM_COLORS[code], secondary: MLB_TEAM_SECONDARY_COLORS[code] }
}

function athlete(id: number, name: string, hand: string | null, code: string | null) {
  return { id, name, hand, headshot: mlbHeadshot(id), team: code ? team(code) : null }
}

function evidence(row: Evidence) {
  return { date: row.game_date, opponent: athlete(row.opponent_id, row.opponent_name, null, row.opponent_team),
    pitch: row.pitch_type ? pitchLabel(row.pitch_type) : null, pitchColor: row.pitch_type ? pitchColor(row.pitch_type) : null,
    match: row.matchScore, velocity: row.velocity, spin: row.spin_rate, exitVelocity: row.launch_speed, angle: row.launch_angle,
    distance: row.hit_distance, xwoba: row.xwoba, runValue: row.run_value }
}

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  if (!await canViewMlb(account.supabase, account.userId)) return reply({ error: 'MLB research is unavailable for this account' }, 403)
  const tier = await requireTier('ultimate')
  if (tier.error) return tier.error
  if (tier.userId !== account.userId) return reply({ error: 'Sign in required' }, 401)

  const params = new URL(request.url).searchParams
  const mode = params.get('mode') ?? 'pregame'
  if (mode !== 'pregame' && mode !== 'live') return reply({ error: 'Choose a valid research mode' }, 400)
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  if (MLB_HIBERNATING || mode === 'pregame') return reply({ date, mode, paused: MLB_HIBERNATING, games: [], matchups: [] })

  try {
    const response = await readSynergy()
    if (!response.ok) return response
    const board = await response.json() as { games: Game[]; matchups: Pair[] }
    return reply({ date, mode, paused: false, games: board.games.map(game => ({ id: game.gameKey, startsAt: game.gameDate,
      status: game.abstractStatus, away: team(game.awayAbbr, game.awayScore), home: team(game.homeAbbr, game.homeScore) })),
    matchups: board.matchups.map(pair => ({ id: `${pair.gameKey}:${pair.batterId}:${pair.pitcherId}`, game: pair.gameKey,
      confirmed: pair.lineupConfirmed, batter: athlete(pair.batterId, pair.batterName, pair.batterBats, pair.batterTeamAbbr),
      pitcher: athlete(pair.pitcherId, pair.pitcherName, pair.pitcherHand, pair.pitcherTeamAbbr), batterScore: pair.batterScore, pitcherScore: pair.pitcherScore,
      evidenceAgainstPitchers: pair.evidencePitchers.map(evidence), evidenceAgainstHitters: pair.evidenceHitters.map(evidence) })) })
  } catch {
    return reply({ error: 'Synergy couldn’t load today’s matchups' }, 503)
  }
}
