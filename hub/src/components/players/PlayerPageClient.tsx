'use client'

import { useEffect, useState } from 'react'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { mlbHeadshot, mlbTeamLogo } from '@/lib/mlb-api'

type PlayerData = {
  season: number
  player: {
    mlb_id: number
    full_name: string | null
    primary_position: string | null
    current_team_id: number | null
    current_team_abbr: string | null
    bat_side: string | null
    pitch_hand: string | null
    height: string | null
    weight: number | null
    birth_date: string | null
    mlb_debut: string | null
    active: boolean | null
  }
  seasonStats: { batting: Record<string, any> | null; pitching: Record<string, any> | null }
  careerStats: { batting: Record<string, any> | null; pitching: Record<string, any> | null }
  statcastSeason: { hitting: Record<string, any>; pitching: Record<string, any> }
  fielding: { position: string; category: string; metrics: Record<string, any> }[]
  baserunning: Record<string, any>
  pitchArsenal: { batter: Record<string, any>[]; pitcher: Record<string, any>[] }
  homeRuns: { hit: Record<string, any>[]; allowed: Record<string, any>[] }
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 16,
  background: 'var(--surface)',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: 'var(--text-2)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 12,
}

function fmt(v: unknown, digits = 3): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(digits)
  return String(v)
}

function StatGrid({ pairs }: { pairs: [string, unknown][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
      {pairs.map(([label, value]) => (
        <div key={label}>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-1)' }}>{fmt(value)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

export function PlayerPageClient({ mlbId }: { mlbId: string }) {
  const [data, setData] = useState<PlayerData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/players/${mlbId}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('Failed to load player data'))
  }, [mlbId])

  if (error) {
    return <div style={{ padding: 24, color: 'var(--red)' }}>{error}</div>
  }
  if (!data) {
    return <div style={{ padding: 24, color: 'var(--text-3)' }}>Loading…</div>
  }

  const { player, seasonStats, careerStats, statcastSeason, pitchArsenal, homeRuns } = data
  const isBatter = !!seasonStats.batting || pitchArsenal.batter.length > 0
  const isPitcher = !!seasonStats.pitching || pitchArsenal.pitcher.length > 0

  const evb = statcastSeason.hitting.exit_velocity_barrels
  const xs = statcastSeason.hitting.expected_stats
  const bbp = statcastSeason.hitting.batted_ball_profile
  const hitHr = statcastSeason.hitting.home_runs
  const qoc = statcastSeason.hitting.statcast_quality_of_contact
  const pitEvb = statcastSeason.pitching.exit_velocity_barrels
  const pitXs = statcastSeason.pitching.expected_stats
  const pitHr = statcastSeason.pitching.home_runs
  const pitQoc = statcastSeason.pitching.statcast_quality_of_contact

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px 64px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <PlayerAvatar
          headshot={mlbHeadshot(player.mlb_id)}
          teamLogo={player.current_team_id ? mlbTeamLogo(player.current_team_id) : undefined}
          teamAbbr={player.current_team_abbr}
          name={player.full_name ?? ''}
          size={72}
        />
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
            {player.full_name ?? `Player ${player.mlb_id}`}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {player.current_team_abbr && <span>{player.current_team_abbr}</span>}
            {player.primary_position && <span>{player.primary_position}</span>}
            {player.bat_side && <span>Bats {player.bat_side}</span>}
            {player.pitch_hand && <span>Throws {player.pitch_hand}</span>}
            {player.height && <span>{player.height}</span>}
            {player.weight && <span>{player.weight} lb</span>}
            {player.mlb_debut && <span>Debut {player.mlb_debut}</span>}
          </div>
        </div>
      </div>

      {/* Season / career stats */}
      {isBatter && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>{data.season} Season — Batting</div>
          {seasonStats.batting ? (
            <StatGrid pairs={[
              ['AVG', seasonStats.batting.avg], ['OBP', seasonStats.batting.obp],
              ['SLG', seasonStats.batting.slg], ['OPS', seasonStats.batting.ops],
              ['HR', seasonStats.batting.home_runs], ['RBI', seasonStats.batting.rbi],
              ['R', seasonStats.batting.runs], ['SB', seasonStats.batting.stolen_bases],
              ['BB', seasonStats.batting.walks], ['K', seasonStats.batting.strikeouts],
              ['G', seasonStats.batting.games_played],
            ]} />
          ) : <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No {data.season} batting stats synced yet.</div>}
        </div>
      )}
      {isPitcher && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>{data.season} Season — Pitching</div>
          {seasonStats.pitching ? (
            <StatGrid pairs={[
              ['ERA', seasonStats.pitching.era], ['WHIP', seasonStats.pitching.whip],
              ['W', seasonStats.pitching.wins], ['L', seasonStats.pitching.losses],
              ['SV', seasonStats.pitching.saves], ['IP', seasonStats.pitching.innings_pitched],
              ['K', seasonStats.pitching.strikeouts], ['BB', seasonStats.pitching.walks],
              ['HR', seasonStats.pitching.home_runs_allowed], ['G', seasonStats.pitching.games_played],
              ['GS', seasonStats.pitching.games_started],
            ]} />
          ) : <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No {data.season} pitching stats synced yet.</div>}
        </div>
      )}

      {/* Statcast snapshot */}
      {isBatter && (evb || xs || bbp || hitHr || qoc) && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Statcast Snapshot — Hitting</div>
          <StatGrid pairs={[
            evb && ['Exit Velo', evb.exit_velocity_avg],
            evb && ['Barrel %', evb.barrel_batted_rate],
            evb && ['Hard Hit %', evb.hard_hit_percent],
            xs && ['xBA', xs.xba], xs && ['xSLG', xs.xslg], xs && ['xwOBA', xs.xwoba],
            hitHr && ['HR', hitHr.hr_total], hitHr && ['xHR', hitHr.xhr],
            qoc && ['Max EV', qoc.max_hit_speed], qoc && ['Max Dist', qoc.max_distance],
            bbp && ['Pull %', bbp.pull_percent], bbp && ['FB %', bbp.flyballs_percent],
          ].filter(Boolean) as [string, unknown][]} />
        </div>
      )}
      {isPitcher && (pitEvb || pitXs || pitHr || pitQoc) && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Statcast Snapshot — Pitching (allowed)</div>
          <StatGrid pairs={[
            pitEvb && ['Exit Velo Allowed', pitEvb.exit_velocity_avg],
            pitEvb && ['Barrel % Allowed', pitEvb.barrel_batted_rate],
            pitEvb && ['Hard Hit % Allowed', pitEvb.hard_hit_percent],
            pitXs && ['xBA Allowed', pitXs.xba], pitXs && ['xSLG Allowed', pitXs.xslg], pitXs && ['xwOBA Allowed', pitXs.xwoba],
            pitHr && ['HR Allowed', pitHr.hr_total], pitHr && ['xHR Allowed', pitHr.xhr],
            pitQoc && ['Max EV Allowed', pitQoc.max_hit_speed],
          ].filter(Boolean) as [string, unknown][]} />
        </div>
      )}

      {/* Pitch arsenal */}
      {isBatter && pitchArsenal.batter.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Pitch Arsenal — vs. Each Pitch Type (Batter)</div>
          <PitchArsenalTable rows={pitchArsenal.batter} />
        </div>
      )}
      {isPitcher && pitchArsenal.pitcher.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Pitch Arsenal — Pitches Thrown</div>
          <PitchArsenalTable rows={pitchArsenal.pitcher} />
        </div>
      )}

      {/* Home run logs */}
      {homeRuns.hit.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Recent Home Runs</div>
          <HrTable rows={homeRuns.hit} opponentKey="pitcher_name" />
        </div>
      )}
      {homeRuns.allowed.length > 0 && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Recent Home Runs Allowed</div>
          <HrTable rows={homeRuns.allowed} opponentKey="batter_name" />
        </div>
      )}
    </div>
  )
}

function PitchArsenalTable({ rows }: { rows: Record<string, any>[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--text-3)', textAlign: 'left' }}>
            <th style={{ padding: '6px 10px' }}>Pitch</th>
            <th style={{ padding: '6px 10px' }}>Pitches</th>
            <th style={{ padding: '6px 10px' }}>Usage %</th>
            <th style={{ padding: '6px 10px' }}>PA</th>
            <th style={{ padding: '6px 10px' }}>BA</th>
            <th style={{ padding: '6px 10px' }}>xwOBA</th>
            <th style={{ padding: '6px 10px' }}>Whiff %</th>
            <th style={{ padding: '6px 10px' }}>RV/100</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 10px', color: 'var(--text-1)', fontWeight: 700 }}>{r.pitch_name ?? r.pitchType}</td>
              <td style={{ padding: '6px 10px' }}>{fmt(r.pitches, 0)}</td>
              <td style={{ padding: '6px 10px' }}>{fmt(r.pitch_usage, 1)}</td>
              <td style={{ padding: '6px 10px' }}>{fmt(r.pa, 0)}</td>
              <td style={{ padding: '6px 10px' }}>{fmt(r.ba)}</td>
              <td style={{ padding: '6px 10px' }}>{fmt(r.est_woba)}</td>
              <td style={{ padding: '6px 10px' }}>{fmt(r.whiff_percent, 1)}</td>
              <td style={{ padding: '6px 10px', color: (r.run_value_per_100 ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {fmt(r.run_value_per_100, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HrTable({ rows, opponentKey }: { rows: Record<string, any>[]; opponentKey: 'pitcher_name' | 'batter_name' }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--text-3)', textAlign: 'left' }}>
            <th style={{ padding: '6px 10px' }}>Date</th>
            <th style={{ padding: '6px 10px' }}>{opponentKey === 'pitcher_name' ? 'Pitcher' : 'Batter'}</th>
            <th style={{ padding: '6px 10px' }}>Result</th>
            <th style={{ padding: '6px 10px' }}>EV</th>
            <th style={{ padding: '6px 10px' }}>LA</th>
            <th style={{ padding: '6px 10px' }}>Dist</th>
            <th style={{ padding: '6px 10px' }}>Category</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 10px', color: 'var(--text-2)' }}>{r.game_date}</td>
              <td style={{ padding: '6px 10px', color: 'var(--text-1)', fontWeight: 700 }}>{r[opponentKey]}</td>
              <td style={{ padding: '6px 10px', textTransform: 'capitalize' }}>{String(r.result ?? '').replace(/_/g, ' ')}</td>
              <td style={{ padding: '6px 10px' }}>{fmt(r.exit_velocity, 0)}</td>
              <td style={{ padding: '6px 10px' }}>{fmt(r.launch_angle, 0)}</td>
              <td style={{ padding: '6px 10px' }}>{fmt(r.hr_distance, 0)}</td>
              <td style={{ padding: '6px 10px', color: r.result === 'home_run' ? 'var(--accent)' : 'var(--text-3)' }}>{r.hr_cat ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
