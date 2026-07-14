import { mlbHeadshot, mlbTeamLogo } from '@/lib/mlb-api'
import { fetchParkHrCounts } from '@/lib/parkHrHistory'
import { HrDerbyTable, type DerbyPlayer } from '@/components/dugout/HrDerbyTable'
import { HrDerbyOddsPanel } from '@/components/dugout/HrDerbyOddsPanel'
import { LiveDerbyTracker } from '@/components/dugout/LiveDerbyTracker'
import { Spotlight } from '@/components/ui/spotlight'

export const revalidate = 300

// Built same-day for tonight's 2026 All-Star Home Run Derby (Citizens Bank
// Park, Philadelphia). There's no real pitcher in a derby (it's BP), so this
// leans entirely on bat-tracking/quality-of-contact data rather than
// matchup/win-loss numbers — pulled straight from mlb-party (the same
// Statcast-derived DB The Dugout itself reads for batter_statcast_splits /
// batter_timing_splits / batter_pitch_type_recent), not re-derived or
// guessed. Every number is live.
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

const MP_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
const MP_KEY = process.env.MLB_PARTY_SERVICE_ROLE_KEY!
const mpH = { apikey: MP_KEY, Authorization: `Bearer ${MP_KEY}`, 'Content-Type': 'application/json' }

async function mpGet(path: string): Promise<any[]> {
  try {
    const res = await fetch(`${MP_URL}${path}`, { headers: mpH, cache: 'no-store' })
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

const STAT_COLS = 'mlb_id,avg_bat_speed,hard_swing_rate,squared_up_per_swing,blast_per_swing,swing_length,attack_angle,exit_velocity_avg,launch_angle_avg,barrel_batted_rate,hard_hit_pct,xhr,hr_total,avg_hr_distance'
const TIME_COLS = 'mlb_id,miss_distance,on_time_percent,n_swings'
const RECENT_COLS = 'mlb_id,pitches,whiff_pct,hard_hit_pct,barrel_pct,home_runs,avg_exit_velo,avg_launch_angle'

export default async function HrDerbyPage() {
  const currentYear = new Date().getFullYear()
  const ids = DERBY_PLAYERS.map(p => p.mlbId)
  const idList = ids.join(',')

  const [phiCounts, statSplits, timingSplits, recentRows] = await Promise.all([
    fetchParkHrCounts('PHI', currentYear).catch(() => new Map()),
    mpGet(`/rest/v1/batter_statcast_splits?mlb_id=in.(${idList})&select=${STAT_COLS}`),
    mpGet(`/rest/v1/batter_timing_splits?mlb_id=in.(${idList})&select=${TIME_COLS}`),
    mpGet(`/rest/v1/batter_pitch_type_recent?mlb_id=in.(${idList})&win=eq.recent&select=${RECENT_COLS}`),
  ])

  const statByPlayer = new Map<number, any>()
  for (const r of statSplits) statByPlayer.set(r.mlb_id, r)

  const timeByPlayer = new Map<number, any>()
  for (const r of timingSplits) timeByPlayer.set(r.mlb_id, r)

  // batter_pitch_type_recent has one row PER pitch type faced in the last
  // 14 days — collapse to one pitch-count-weighted line per batter so the
  // table shows a single real "recent form" number, not a fragment per pitch.
  const recentByPlayer = new Map<number, { pitches: number; whiff: number; hardHit: number; barrel: number; hrs: number; ev: number }>()
  for (const r of recentRows) {
    const cur = recentByPlayer.get(r.mlb_id) ?? { pitches: 0, whiff: 0, hardHit: 0, barrel: 0, hrs: 0, ev: 0 }
    const w = r.pitches ?? 0
    cur.pitches += w
    cur.whiff += (r.whiff_pct ?? 0) * w
    cur.hardHit += (r.hard_hit_pct ?? 0) * w
    cur.barrel += (r.barrel_pct ?? 0) * w
    cur.hrs += r.home_runs ?? 0
    cur.ev += (r.avg_exit_velo ?? 0) * w
    recentByPlayer.set(r.mlb_id, cur)
  }

  const players: DerbyPlayer[] = DERBY_PLAYERS.map(p => {
    const s = statByPlayer.get(p.mlbId) ?? {}
    const t = timeByPlayer.get(p.mlbId) ?? {}
    const rec = recentByPlayer.get(p.mlbId)
    const phi = (phiCounts as Map<number, { total: number; season: number }>).get(p.mlbId)
    return {
      name: p.name,
      mlbId: p.mlbId,
      teamAbbr: p.teamAbbr,
      headshotUrl: mlbHeadshot(p.mlbId),
      teamLogoUrl: mlbTeamLogo(p.teamId),
      avgBatSpeed: s.avg_bat_speed ?? 0,
      squaredUpPct: s.squared_up_per_swing ?? 0,
      blastPct: s.blast_per_swing ?? 0,
      exitVeloAvg: s.exit_velocity_avg ?? 0,
      barrelPct: s.barrel_batted_rate ?? 0,
      hardHitPct: s.hard_hit_pct ?? 0,
      xhr: s.xhr ?? 0,
      hrTotal: s.hr_total ?? 0,
      avgHrDistance: s.avg_hr_distance ?? 0,
      onTimePct: t.on_time_percent ?? 0,
      missDistance: t.miss_distance ?? 0,
      recentEv: rec && rec.pitches ? rec.ev / rec.pitches : 0,
      recentHardHit: rec && rec.pitches ? rec.hardHit / rec.pitches : 0,
      recentBarrel: rec && rec.pitches ? rec.barrel / rec.pitches : 0,
      recentWhiff: rec && rec.pitches ? rec.whiff / rec.pitches : 0,
      recentHrs: rec?.hrs ?? 0,
      phiCareerHr: phi?.total ?? 0,
    }
  })

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
      <Spotlight className="left-0 top-0" fill="#B4FF4D" />
      <div style={{ position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)', width: 700, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(180,255,77,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1240, margin: '0 auto', padding: '32px 20px 64px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            All-Star Week · The Dugout
          </p>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            🏟️ Home Run Derby Watch
          </h1>
        </div>

        <LiveDerbyTracker players={players} />

        <HrDerbyTable players={players} />

        <HrDerbyOddsPanel players={players} />
      </div>
    </div>
  )
}
