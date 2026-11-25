import { NextResponse } from 'next/server'
import { mlbHeadshot, mlbTeamLogo } from '@slipsurge/core/mlb-api'
import { getTeamLogoPngUrl, MLB_TEAM_COLORS, MLB_TEAM_SECONDARY_COLORS } from '@slipsurge/core/mlbTeamColors'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { requireTier } from '@/lib/requireTier'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const cacheSeconds = 1800
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })

type Team = { id: number; name: string; abbreviation?: string; venue?: { name?: string }; league?: { name?: string }; division?: { name?: string } }
type RosterEntry = { person: { id: number; fullName: string }; jerseyNumber?: string; position?: { name?: string; abbreviation?: string; type?: string }; status?: { description?: string } }

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const gate = await requireTier('basic')
  if (gate.error) return gate.error
  if (gate.userId !== account.userId) return reply({ error: 'Sign in required' }, 401)
  if (!await canViewMlb(account.supabase, account.userId)) return reply({ error: 'MLB team research is unavailable for this account' }, 403)
  const query = new URL(request.url).searchParams
  const id = query.get('id') ?? ''
  if (!/^[1-9][0-9]{0,5}$/.test(id) || query.getAll('id').length !== 1) return reply({ error: 'Invalid team' }, 400)

  try {
    const base = `https://statsapi.mlb.com/api/v1/teams/${id}`
    const options = { next: { revalidate: cacheSeconds }, signal: AbortSignal.timeout(8_000) }
    const [teamResponse, rosterResponse] = await Promise.all([fetch(base, options), fetch(`${base}/roster?rosterType=active`, options)])
    if (teamResponse.status === 404 || rosterResponse.status === 404) return reply({ error: 'MLB team unavailable' }, 404)
    if (!teamResponse.ok || !rosterResponse.ok) throw Error('MLB provider unavailable')
    const [summary, active]: [{ teams?: Team[] }, { roster?: RosterEntry[] }] = await Promise.all([teamResponse.json(), rosterResponse.json()])
    const club = summary.teams?.find(team => team.id === Number(id))
    if (!club || !Array.isArray(active.roster)) return reply({ error: 'MLB roster unavailable' }, 404)
    const code = club.abbreviation?.toUpperCase() ?? ''
    const roster = [...new Map(active.roster.filter(row => Number.isSafeInteger(row.person?.id) && row.person.id > 0 && row.person.fullName)
      .map(row => [row.person.id, { id: row.person.id, name: row.person.fullName, group: row.position?.type ?? 'Roster',
        position: row.position?.name ?? null, abbreviation: row.position?.abbreviation ?? null, jersey: row.jerseyNumber ?? null,
        status: row.status?.description ?? null, headshot: mlbHeadshot(row.person.id) }])).values()]
    return reply({ id: club.id, name: club.name, code, venue: club.venue?.name, league: club.league?.name, division: club.division?.name,
      logo: getTeamLogoPngUrl(code) ?? mlbTeamLogo(club.id), primary: MLB_TEAM_COLORS[code], secondary: MLB_TEAM_SECONDARY_COLORS[code], roster })
  } catch {
    return reply({ error: 'The official MLB roster could not be loaded' }, 503)
  }
}
