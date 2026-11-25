import { NextResponse } from 'next/server'
import { GET as profile } from '@/app/api/players/[id]/route'
import { GET as pitchLog } from '@/app/api/players/[id]/pitch-log/route'
import { GET as today } from '@/app/api/players/[id]/today/route'
import { mlbHeadshot, PITCH_COLORS, pitchLabel } from '@slipsurge/core/mlb-api'
import { MLB_PARK_SHAPES } from '@slipsurge/core/mlbParkShapes'
import { MLB_PARKS } from '@slipsurge/core/mlbParks'
import { mlbTeamAbbrById } from '@slipsurge/core/mlbTeams'
import { getTeamLogoPngUrl, MLB_TEAM_COLORS, MLB_TEAM_NAMES, MLB_TEAM_SECONDARY_COLORS } from '@slipsurge/core/mlbTeamColors'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { requireTier } from '@/lib/requireTier'

export const maxDuration = 90
const headers = { 'Cache-Control': 'private, no-store' }
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })
type Opponent = { opponent_id: number; opponent_team: string | null }
type SprayContact = Opponent & { home_team_id: number | null; venue_id: number | null; venue_name: string | null }
type HomeRun = { batter_id: number; pitcher_id: number; opponent_team: string | null }
const specialVenues = new Set([5340, 5355, 5445])
const parkAliases: Record<string, string> = { AZ: 'ARI', OAK: 'ATH', CHW: 'CWS', KCR: 'KC', SDP: 'SD', SFG: 'SF', TBR: 'TB', WSN: 'WSH' }
const teamArtwork = (code: string) => ({ code, name: MLB_TEAM_NAMES[code] ?? code, logo: getTeamLogoPngUrl(code),
  primary: MLB_TEAM_COLORS[code], secondary: MLB_TEAM_SECONDARY_COLORS[code] })
function parkArtwork(row: SprayContact) {
  const home = mlbTeamAbbrById(Number(row.home_team_id)) ?? 'MLB'
  const code = parkAliases[home] ?? home
  const name = row.venue_name ?? MLB_PARKS[code]?.name ?? 'Unknown venue'
  const exact = !specialVenues.has(Number(row.venue_id)) && Boolean(MLB_PARKS[code])
  return { key: `${row.venue_id || 'unknown'}:${row.venue_name ?? code}`, name,
    team: exact ? teamArtwork(code) : null, shape: exact ? MLB_PARK_SHAPES[code] ?? null : null }
}

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const query = new URL(request.url).searchParams
  const id = query.get('id') ?? ''
  const view = query.get('view') ?? 'profile'
  if (!/^[1-9][0-9]{0,6}$/.test(id) || !['profile', 'batting', 'pitching', 'spray', 'today'].includes(view)) return reply({ error: 'Choose a valid MLB player' }, 400)

  const params = { params: Promise.resolve({ id }) }
  try {
    if (view === 'today' && MLB_HIBERNATING) {
      const gate = await requireTier('basic')
      return gate.error ?? reply({ playingToday: false, context: null })
    }
    const loader = view === 'profile' ? profile : view === 'today' ? today : pitchLog
    const result = await loader(request, params)
    if (!result.ok) return result
    if (view === 'today') {
      const responseHeaders = new Headers(result.headers)
      responseHeaders.set('Cache-Control', headers['Cache-Control'])
      return new Response(result.body, { status: result.status, headers: responseHeaders })
    }
    if (view !== 'profile') {
      const log = await result.json() as { batterRows: Opponent[]; pitcherRows: Opponent[]; sprayRows: SprayContact[]; nearHrAvailable: boolean }
      if (view === 'spray') {
        const parks = new Map<string, ReturnType<typeof parkArtwork>>()
        const rows = log.sprayRows.map(row => {
          const park = parkArtwork(row)
          parks.set(park.key, park)
          return { ...row, parkKey: park.key }
        })
        const opponents = Object.fromEntries([...new Set(rows.map(row => row.opponent_id))].map(id => [id, mlbHeadshot(id)]))
        return reply({ rows, opponents, parks: Object.fromEntries(parks), nearHrAvailable: log.nearHrAvailable })
      }
      const rows = view === 'batting' ? log.batterRows : log.pitcherRows
      const opponents = Object.fromEntries([...new Set(rows.map(row => row.opponent_id))].map(id => [id, mlbHeadshot(id)]))
      return reply({ rows, opponents, nearHrAvailable: log.nearHrAvailable })
    }
    const data = await result.json() as { player: { mlb_id: number; current_team_abbr: string | null };
      homeRuns: { hit: HomeRun[]; allowed: HomeRun[] } }
    if (data.player.mlb_id !== Number(id)) return reply({ error: 'The selected MLB player could not be confirmed' }, 503)
    const code = data.player.current_team_abbr
    const pitches = Object.fromEntries(Object.entries(PITCH_COLORS).map(([code, color]) => [code, { label: pitchLabel(code), color }]))
    const teams = Object.fromEntries(Object.keys(MLB_TEAM_NAMES).map(team => [team, teamArtwork(team)]))
    const homeRunOpponents = new Set([...data.homeRuns.hit.map(row => row.pitcher_id), ...data.homeRuns.allowed.map(row => row.batter_id)])
    const opponents = Object.fromEntries([...homeRunOpponents].map(id => [id, mlbHeadshot(id)]))
    return reply({ ...data, pitches, teams, opponents, headshot: mlbHeadshot(Number(id)), team: code ? teamArtwork(code) : null })
  } catch {
    return reply({ error: 'The MLB player profile is temporarily unavailable' }, 503)
  }
}
