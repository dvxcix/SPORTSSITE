import { NextResponse } from 'next/server'
import { fetchGameLineups, fetchParkHrCounts } from '@/lib/parkHrHistory'

export const revalidate = 900

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const gamePk = searchParams.get('gamePk')
  if (!gamePk) return NextResponse.json({ error: 'gamePk required' }, { status: 400 })

  try {
    const lineups = await fetchGameLineups(gamePk)
    const currentSeason = new Date().getFullYear()
    const hrCounts = await fetchParkHrCounts(lineups.homeAbbr, currentSeason)

    const batters = [...lineups.home.map(b => ({ ...b, team: lineups.homeAbbr })), ...lineups.away.map(b => ({ ...b, team: lineups.awayAbbr }))]
      .map(b => {
        const c = hrCounts.get(b.mlbId) ?? { total: 0, season: 0 }
        return {
          mlbId: b.mlbId,
          name: b.name,
          team: b.team,
          position: b.position,
          career: c.total,
          season: c.season,
        }
      })
      .sort((a, b) => b.career - a.career || b.season - a.season || a.name.localeCompare(b.name))

    return NextResponse.json({
      confirmed: lineups.confirmed,
      homeTeam: lineups.homeTeam,
      awayTeam: lineups.awayTeam,
      homeAbbr: lineups.homeAbbr,
      awayAbbr: lineups.awayAbbr,
      season: currentSeason,
      batters,
    })
  } catch {
    return NextResponse.json({ error: 'Could not load park HR history' }, { status: 500 })
  }
}
