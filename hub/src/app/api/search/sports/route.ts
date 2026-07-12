import { NextResponse } from 'next/server'
import { searchMlbTeams } from '@/lib/mlbTeams'

export const revalidate = 0

// Server-side, same pattern as every other MLB Stats API call in this app
// (Dugout's route.ts, etc.) — statsapi.mlb.com isn't reliably CORS-open for
// client-side fetches, and this keeps the same fetch/User-Agent convention
// as the rest of the codebase. All public data (MLB's own people-search +
// schedule endpoints) — no site-internal data touched here.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ players: [], teams: [] })

  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const [playersRes, scheduleRes] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(q)}&hydrate=currentTeam`, {
      headers: { 'User-Agent': 'SlipSurge/1.0' }, cache: 'no-store',
    }).catch(() => null),
    fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${todayET}&hydrate=probablePitcher`, {
      headers: { 'User-Agent': 'SlipSurge/1.0' }, cache: 'no-store',
    }).catch(() => null),
  ])

  const gamePkByTeamId: Record<number, number> = {}
  // Pitcher Report is pitcher-specific (it's the "who's this guy's own
  // matchup look like" tool) — only worth linking to for someone actually
  // probable to start today, not every reliever/position player who
  // happens to match the search text. Same probablePitcher field the
  // Dugout data route already reads.
  const probableStarterIds = new Set<number>()
  if (scheduleRes?.ok) {
    const data = await scheduleRes.json()
    for (const g of data.dates?.[0]?.games ?? []) {
      if (g.teams?.home?.team?.id) gamePkByTeamId[g.teams.home.team.id] = g.gamePk
      if (g.teams?.away?.team?.id) gamePkByTeamId[g.teams.away.team.id] = g.gamePk
      const hp = g.teams?.home?.probablePitcher?.id
      const ap = g.teams?.away?.probablePitcher?.id
      if (hp) probableStarterIds.add(hp)
      if (ap) probableStarterIds.add(ap)
    }
  }

  let players: any[] = []
  if (playersRes?.ok) {
    const data = await playersRes.json()
    players = (data.people ?? [])
      // Beta scope: active current-roster players, not decades of retired
      // names — MLB's search returns anyone who ever played.
      .filter((p: any) => p.active)
      .slice(0, 8)
      .map((p: any) => ({
        mlbId: p.id,
        name: p.fullName,
        position: p.primaryPosition?.abbreviation ?? null,
        teamId: p.currentTeam?.id ?? null,
        teamName: p.currentTeam?.name ?? null,
        gamePk: p.currentTeam?.id ? (gamePkByTeamId[p.currentTeam.id] ?? null) : null,
        isProbableStarter: probableStarterIds.has(p.id),
      }))
  }

  const teams = searchMlbTeams(q).slice(0, 5).map(t => ({ ...t, gamePk: gamePkByTeamId[t.id] ?? null }))

  return NextResponse.json({ players, teams, date: todayET }, { headers: { 'Cache-Control': 'no-store' } })
}
