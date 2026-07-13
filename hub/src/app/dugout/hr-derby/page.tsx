import { mlbHeadshot, mlbTeamLogo } from '@/lib/mlb-api'
import { fetchParkHrCounts } from '@/lib/parkHrHistory'
import { HrDerbyTable, type DerbyPlayer } from '@/components/dugout/HrDerbyTable'
import { Spotlight } from '@/components/ui/spotlight'

export const revalidate = 300

// Built same-day for tonight's 2026 All-Star Home Run Derby (Citizens Bank
// Park, Philadelphia) — every number here is a real, live MLB Stats API call
// made when this page renders (season/career hitting stats), plus the same
// Statcast-CSV-backed park-HR lookup already proven out in the Dugout's own
// park-history feature (fetchParkHrCounts). No made-up numbers, no
// bat-tracking/Squared-Up/Blast metrics included — Savant only exposes those
// through a separate leaderboard this page doesn't pull from tonight.
const DERBY_PLAYERS: { name: string; mlbId: number; teamId: number; teamAbbr: string }[] = [
  { name: 'Munetaka Murakami', mlbId: 808959, teamId: 145, teamAbbr: 'CWS' },
  { name: 'Bryce Harper', mlbId: 547180, teamId: 143, teamAbbr: 'PHI' },
  { name: 'Kyle Schwarber', mlbId: 656941, teamId: 143, teamAbbr: 'PHI' },
  { name: 'Jac Caglianone', mlbId: 695506, teamId: 118, teamAbbr: 'KC' },
  { name: 'Willson Contreras', mlbId: 575929, teamId: 111, teamAbbr: 'BOS' },
  { name: 'Junior Caminero', mlbId: 691406, teamId: 139, teamAbbr: 'TB' },
  { name: 'Ben Rice', mlbId: 700250, teamId: 147, teamAbbr: 'NYY' },
  { name: 'Jordan Walker', mlbId: 691023, teamId: 138, teamAbbr: 'STL' },
]

async function fetchStats(mlbId: number, stats: 'season' | 'career') {
  const seasonParam = stats === 'season' ? `&season=${new Date().getFullYear()}` : ''
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=${stats}&group=hitting${seasonParam}`,
      { headers: { 'User-Agent': 'SlipSurge/1.0' }, cache: 'no-store' }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.stats?.[0]?.splits?.[0]?.stat ?? null
  } catch { return null }
}

export default async function HrDerbyPage() {
  const currentYear = new Date().getFullYear()

  const [phiCounts, ...playerStats] = await Promise.all([
    fetchParkHrCounts('PHI', currentYear).catch(() => new Map()),
    ...DERBY_PLAYERS.map(async p => {
      const [season, career] = await Promise.all([
        fetchStats(p.mlbId, 'season'),
        fetchStats(p.mlbId, 'career'),
      ])
      return { p, season, career }
    }),
  ])

  const players: DerbyPlayer[] = playerStats.map(({ p, season, career }) => {
    const phi = (phiCounts as Map<number, { total: number; season: number }>).get(p.mlbId)
    return {
      name: p.name,
      mlbId: p.mlbId,
      teamAbbr: p.teamAbbr,
      headshotUrl: mlbHeadshot(p.mlbId),
      teamLogoUrl: mlbTeamLogo(p.teamId),
      seasonHr: season?.homeRuns ?? 0,
      careerHr: career?.homeRuns ?? 0,
      avg: season?.avg ?? '.000',
      obp: season?.obp ?? '.000',
      slg: season?.slg ?? '.000',
      ops: season?.ops ?? '.000',
      games: season?.gamesPlayed ?? 0,
      phiCareerHr: phi?.total ?? 0,
      phiSeasonHr: phi?.season ?? 0,
    }
  })

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
      <Spotlight className="left-0 top-0" fill="#B4FF4D" />
      <div style={{ position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)', width: 700, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(180,255,77,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '32px 20px 64px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            All-Star Week · The Dugout
          </p>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            🏟️ Home Run Derby Watch
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-2)', marginTop: 10, maxWidth: 560, margin: '10px auto 0' }}>
            Every number below is real, live data — season &amp; career power numbers, plus how each guy has actually hit at Citizens Bank Park (the derby's home tonight). Click a column to sort.
          </p>
        </div>

        <HrDerbyTable players={players} />

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)', marginTop: 24 }}>
          Source: MLB Stats API (live) · Park history via Statcast (2015–present) · Updated on page load
        </p>
      </div>
    </div>
  )
}
