'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Spotlight } from '@/components/ui/spotlight'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { mlbHeadshot, mlbTeamLogo } from '@/lib/mlb-api'
import { MLB_TEAM_IDS } from '@/lib/mlbTeamColors'
import { BookLogo } from '@/components/BookLogo'
import {
  groupByBook, marketsForPlayer, groupBySection, searchMarkets, devig,
  computeCrossBookFlags, crossBookFlagsForPlayer,
  computeMarketVsDataFlags, dataMismatchFlagsForPlayer,
  computeReserveMlbIds, computeContainmentFlags, containmentFlagsForPlayer,
  canonicalizeTitle,
  type Market, type MarketOption, type Sportsbook,
} from '@/lib/allStarMarkets'

const BOOK_LABEL: Record<Sportsbook, string> = { fanduel: 'FanDuel', betmgm: 'BetMGM', caesars: 'Caesars' }

// Meteors uses per-mount random delays/durations — server vs client render
// would differ, same reason the register page already loads it client-only.
const Meteors = dynamic(() => import('@/components/ui/meteors').then(m => m.Meteors), { ssr: false })

const ID_TO_ABBR: Record<number, string> = Object.fromEntries(
  Object.entries(MLB_TEAM_IDS).map(([abbr, id]) => [id, abbr])
)

type Roster = {
  mlb_id: number; name: string; jersey: string; position: string
  bats: string; throws: string; teamId: number | null; teamName: string; league: 'AL' | 'NL'
}

function nv(x: any): number | null { return x == null ? null : Number(x) }

// Verbatim from DugoutClient.tsx — relative (not absolute) heat scaling
// against whatever's currently on screen.
function heat(v: number | null, all: (number | null)[], dir: 'hi' | 'lo' = 'hi'): React.CSSProperties {
  if (v == null) return {}
  const vals = all.filter((x): x is number => x != null)
  if (vals.length < 3) return {}
  const mn = Math.min(...vals), mx = Math.max(...vals)
  if (mx === mn) return {}
  let t = (v - mn) / (mx - mn)
  if (dir === 'lo') t = 1 - t
  if (t < 0.33) return { background: `rgba(239,68,68,${0.05 + (0.33 - t) * 0.55})` }
  if (t > 0.66) return { background: `rgba(74,222,128,${0.05 + (t - 0.66) * 0.65})` }
  return {}
}

function fmt(v: number | null, dec = 1): string {
  if (v == null) return '–'
  return v.toFixed(dec)
}

type SortState = { col: string; dir: 'asc' | 'desc' } | null

function sortRows<T extends Record<string, any>>(rows: T[], sort: SortState): T[] {
  if (!sort) return rows
  const { col, dir } = sort
  return [...rows].sort((a, b) => {
    const av = a[col], bv = b[col]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return dir === 'asc' ? av - bv : bv - av
  })
}

function toggleSort(setter: React.Dispatch<React.SetStateAction<SortState>>, col: string) {
  setter(s => (s?.col === col ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' }))
}

// ─── Batter row (real Statcast splits, no odds) ────────────────────────────
// No fixed opposing pitcher exists for an All-Star Game (pitchers rotate
// every inning) — the hand toggle picks which of the batter's own real
// season/recent splits (vs RHP or vs LHP) to show, same pitch_hand-keyed
// tables The Dugout reads for a normal game, just without a single real
// pitcher's own arsenal to weight timing against.
function buildBatterRow(player: Roster, hand: 'R' | 'L', statSplits: any[], timingSplits: any[]) {
  const se = statSplits.find(s => s.mlb_id === player.mlb_id && s.pitch_hand === hand && s.win === 'season')
  const re = statSplits.find(s => s.mlb_id === player.mlb_id && s.pitch_hand === hand && s.win === 'recent')

  const timingRows = timingSplits.filter(t => t.mlb_id === player.mlb_id && t.pitch_hand === hand)
  const aggTiming = (win: string) => {
    let ow = 0, o = 0, mw = 0, m = 0
    for (const t of timingRows.filter((t: any) => t.win === win)) {
      const w = t.n_swings || 0
      if (t.on_time_percent != null) { o += w * t.on_time_percent; ow += w }
      if (t.miss_distance != null) { m += w * t.miss_distance; mw += w }
    }
    return { timing: ow > 0 ? o / ow : null, miss: mw > 0 ? m / mw : null }
  }
  const sT = aggTiming('season'), rT = aggTiming('recent')

  const s_spd = nv(se?.avg_bat_speed)
  const r_spd = nv(re?.avg_bat_speed)
  const s_sq = nv(se?.squared_up_per_swing)
  const r_sq = nv(re?.squared_up_per_swing)

  return {
    mlb_id: player.mlb_id, name: player.name, jersey: player.jersey, position: player.position,
    bats: player.bats, teamId: player.teamId, teamName: player.teamName, league: player.league,
    s_spd, r_spd, d_spd: s_spd != null && r_spd != null ? r_spd - s_spd : null,
    s_timing: sT.timing, r_timing: rT.timing, s_miss: sT.miss, r_miss: rT.miss,
    s_hrd: nv(se?.hard_swing_rate),
    s_sq, r_sq, d_sq: s_sq != null && r_sq != null ? r_sq - s_sq : null,
    s_bla: nv(se?.blast_per_swing), r_bla: nv(re?.blast_per_swing),
    s_len: nv(se?.swing_length),
    s_atk: nv(se?.attack_angle), r_atk: nv(re?.attack_angle),
    s_iaa: nv(se?.ideal_attack_angle_rate),
    s_tlt: nv(se?.swing_tilt),
    s_brl: nv(se?.barrel_batted_rate),
    s_hh: nv(se?.hard_hit_pct),
    s_pa: nv(se?.pull_air_rate),
    s_fb: nv(se?.fb_rate),
    s_ev: nv(se?.exit_velocity_avg),
    s_la: nv(se?.launch_angle_avg),
    s_xhr: nv(se?.xhr),
    s_hr: nv(se?.hr_total),
  }
}

type BatterRow = ReturnType<typeof buildBatterRow>

const BATTER_COLS: { key: keyof BatterRow; label: string; title: string; dir?: 'lo'; dec?: number }[] = [
  { key: 's_spd', label: 'BSpd', title: 'Season avg bat speed (mph)' },
  { key: 'r_spd', label: 'R·Spd', title: 'Recent (14-day) avg bat speed (mph)' },
  { key: 'd_spd', label: 'ΔSpd', title: 'Recent minus season bat speed' },
  { key: 's_timing', label: 'Timing', title: 'Season on-time swing %' },
  { key: 'r_timing', label: 'R·Timing', title: 'Recent on-time swing %' },
  { key: 's_miss', label: 'Miss', title: 'Season avg miss distance (in) — lower is better', dir: 'lo' },
  { key: 'r_miss', label: 'R·Miss', title: 'Recent avg miss distance (in) — lower is better', dir: 'lo' },
  { key: 's_hrd', label: 'HardSw', title: 'Season hard-swing rate %' },
  { key: 's_sq', label: 'Sq', title: 'Season squared-up per swing %' },
  { key: 'r_sq', label: 'R·Sq', title: 'Recent squared-up per swing %' },
  { key: 'd_sq', label: 'ΔSq', title: 'Recent minus season squared-up %' },
  { key: 's_bla', label: 'Blast', title: 'Season blast per swing %' },
  { key: 'r_bla', label: 'R·Bla', title: 'Recent blast per swing %' },
  { key: 's_len', label: 'SwLen', title: 'Season swing length (ft) — shorter is better', dir: 'lo' },
  { key: 's_atk', label: 'Atk°', title: 'Season attack angle (deg)' },
  { key: 'r_atk', label: 'R·Atk', title: 'Recent attack angle (deg)' },
  { key: 's_iaa', label: 'IdlAA', title: 'Season ideal attack angle rate %' },
  { key: 's_tlt', label: 'Tilt', title: 'Season swing tilt (deg)' },
  { key: 's_brl', label: 'Brl%', title: 'Season barrel rate %' },
  { key: 's_hh', label: 'HH%', title: 'Season hard-hit rate %' },
  { key: 's_pa', label: 'PullAir', title: 'Season pull-air rate %' },
  { key: 's_fb', label: 'FB%', title: 'Season fly-ball rate %' },
  { key: 's_ev', label: 'EV', title: 'Season avg exit velocity (mph)' },
  { key: 's_la', label: 'LA', title: 'Season avg launch angle (deg)' },
  { key: 's_xhr', label: 'xHR', title: 'Season expected home runs' },
  { key: 's_hr', label: 'HR', title: 'Season home run total', dec: 0 },
]

// ─── Pitcher row ────────────────────────────────────────────────────────────
function buildPitcherRow(player: Roster, hand: 'R' | 'L', pitcherSplits: any[]) {
  const row = pitcherSplits.find(p => p.mlb_id === player.mlb_id && p.bat_hand === hand)
  return {
    mlb_id: player.mlb_id, name: player.name, jersey: player.jersey,
    throws: player.throws, teamId: player.teamId, teamName: player.teamName, league: player.league,
    velo_ff: nv(row?.velo_ff),
    arm_angle: nv(row?.arm_angle),
    whiff_per_swing_against: nv(row?.whiff_per_swing_against),
    hard_hit_pct: nv(row?.hard_hit_pct),
    exit_velocity_avg: nv(row?.exit_velocity_avg),
    barrel_batted_rate: nv(row?.barrel_batted_rate),
    xhr: nv(row?.xhr),
    hr_total: nv(row?.hr_total),
  }
}

type PitcherRow = ReturnType<typeof buildPitcherRow>

const PITCHER_COLS: { key: keyof PitcherRow; label: string; title: string; dir?: 'lo'; dec?: number }[] = [
  { key: 'velo_ff', label: 'FF Velo', title: '4-seam avg velocity (mph)' },
  { key: 'arm_angle', label: 'Arm°', title: 'Release arm angle (deg)' },
  { key: 'whiff_per_swing_against', label: 'Whiff%', title: 'Whiff rate induced on swings' },
  { key: 'hard_hit_pct', label: 'HH%', title: 'Hard-hit rate allowed — lower is better', dir: 'lo' },
  { key: 'exit_velocity_avg', label: 'EV', title: 'Avg exit velocity allowed — lower is better', dir: 'lo' },
  { key: 'barrel_batted_rate', label: 'Brl%', title: 'Barrel rate allowed — lower is better', dir: 'lo' },
  { key: 'xhr', label: 'xHR', title: 'Expected HRs allowed — lower is better', dir: 'lo' },
  { key: 'hr_total', label: 'HR', title: 'HRs allowed — lower is better', dir: 'lo', dec: 0 },
]

// Real recency pitch-mix matchup edge — same signal The Dugout/Pitcher
// Report compute: usage-weighted across every pitch type the SELECTED
// pitcher actually throws, is the batter recently hitting that exact pitch
// hard (high hard-hit%, low whiff%), and has the pitcher recently been
// getting hit hard on that same pitch. Requires real recent sample on both
// sides (>=8 pitches) per pitch type, else that pitch type is skipped.
function computeMatchupEdge(
  batterId: number, pitcherId: number, pitcherHand: 'R' | 'L',
  batterPitchRecent: any[], pitcherPitchRecent: any[]
): number | null {
  const pitcherRows = pitcherPitchRecent.filter(r => r.mlb_id === pitcherId)
  if (!pitcherRows.length) return null
  let sum = 0, wsum = 0
  for (const pr of pitcherRows) {
    const usage = pr.usage_pct || 0
    if (usage <= 4) continue
    const br = batterPitchRecent.find(b => b.mlb_id === batterId && b.pitch_type === pr.pitch_type && b.pitcher_hand === pitcherHand)
    if (!br || (br.pitches ?? 0) < 8 || (pr.pitches ?? 0) < 8) continue
    const batScore = (br.hard_hit_pct ?? 30) - (br.whiff_pct ?? 25)
    const pitScore = (pr.hard_hit_pct ?? 30) - (pr.whiff_pct ?? 20)
    const sampleConf = Math.min(1, Math.min(br.pitches, pr.pitches) / 20)
    const w = usage * sampleConf
    sum += w * (batScore + pitScore)
    wsum += w
  }
  return wsum > 0 ? sum / wsum : null
}

function TH({ label, title, sortKey, sort, onSort }: { label: string; title: string; sortKey: string; sort: SortState; onSort: (col: string) => void }) {
  const active = sort?.col === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      title={title}
      style={{
        padding: '6px 8px', fontSize: 10, fontWeight: 800,
        color: active ? 'var(--accent)' : 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.03em',
        whiteSpace: 'nowrap', textAlign: 'right', userSelect: 'none', cursor: 'pointer',
      }}
    >
      {label}{active ? (sort!.dir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  )
}

const HAND_COLOR: Record<string, string> = { L: '#60a5fa', R: '#fb923c', S: '#c084fc' }

function LeagueBatterTable({
  league, batterRoster, hand, sort, onSort, expanded, onToggleExpand, markets, flags, dataFlags,
  opposingPitchers, statSplits, timingSplits, batterPitchRecent, pitcherPitchRecent,
}: {
  league: 'AL' | 'NL'; batterRoster: Roster[]; hand: 'R' | 'L'
  sort: SortState; onSort: (col: string) => void
  expanded: Set<number>; onToggleExpand: (id: number) => void; markets: Market[]
  flags: ReturnType<typeof computeCrossBookFlags>
  dataFlags: ReturnType<typeof computeMarketVsDataFlags>
  opposingPitchers: Roster[]; statSplits: any[]; timingSplits: any[]
  batterPitchRecent: any[]; pitcherPitchRecent: any[]
}) {
  // Selecting a pitcher up top recomputes EVERY batter's row (and the
  // heatmap, since it's scaled off whatever's currently on screen) vs that
  // exact pitcher's real throwing hand — this is the actual "who's the best
  // batter vs this specific pitcher" tool, not a per-row aside.
  const [pitcherId, setPitcherId] = useState<number | ''>('')
  const selectedPitcher = opposingPitchers.find(p => p.mlb_id === pitcherId)
  const effectiveHand = (selectedPitcher ? (selectedPitcher.throws === 'L' ? 'L' : 'R') : hand) as 'R' | 'L'
  const buildRow = (p: Roster) => {
    const row = buildBatterRow(p, effectiveHand, statSplits, timingSplits)
    const edge = selectedPitcher
      ? computeMatchupEdge(p.mlb_id, selectedPitcher.mlb_id, effectiveHand, batterPitchRecent, pitcherPitchRecent)
      : null
    return { ...row, edge }
  }
  const rows = useMemo(
    () => sortRows(batterRoster.map(buildRow), sort),
    [batterRoster, effectiveHand, statSplits, timingSplits, batterPitchRecent, pitcherPitchRecent, selectedPitcher, sort]
  )
  const pool = useMemo(
    () => batterRoster.map(buildRow),
    [batterRoster, effectiveHand, statSplits, timingSplits, batterPitchRecent, pitcherPitchRecent, selectedPitcher]
  )
  const g = (f: string) => pool.map((r: any) => r[f])
  const pAbbr = selectedPitcher?.teamId != null ? ID_TO_ABBR[selectedPitcher.teamId] : undefined
  const pLogo = selectedPitcher?.teamId != null ? mlbTeamLogo(selectedPitcher.teamId) : undefined
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, fontWeight: 900, padding: '3px 8px', borderRadius: 6,
          background: league === 'AL' ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
          color: league === 'AL' ? '#f87171' : '#60a5fa',
        }}>{league === 'AL' ? 'AMERICAN LEAGUE' : 'NATIONAL LEAGUE'}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{rows.length} batters</span>
        <select
          value={pitcherId}
          onChange={e => setPitcherId(e.target.value ? Number(e.target.value) : '')}
          className="ss-input"
          style={{ fontSize: 11, padding: '5px 8px', maxWidth: 260 }}
        >
          <option value="">vs {hand === 'R' ? 'RHP' : 'LHP'} (season avg)…</option>
          {opposingPitchers.map(p => <option key={p.mlb_id} value={p.mlb_id}>{p.name} ({p.throws}HP)</option>)}
        </select>
        {selectedPitcher && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlayerAvatar headshot={mlbHeadshot(selectedPitcher.mlb_id)} teamLogo={pLogo} teamAbbr={pAbbr} name={selectedPitcher.name} size={22} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)' }}>{selectedPitcher.name}</span>
          </span>
        )}
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--border)', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', position: 'sticky', left: 0, background: 'var(--surface-2)' }}>Player</th>
              {selectedPitcher && (
                <TH label="Edge" title="Recent pitch-mix matchup edge vs this pitcher's real recent arsenal (usage-weighted hard-hit% minus whiff%, both sides, min. 8-pitch recent sample per pitch type)" sortKey="edge" sort={sort} onSort={onSort} />
              )}
              {BATTER_COLS.map(c => <TH key={c.key as string} label={c.label} title={c.title} sortKey={c.key as string} sort={sort} onSort={onSort} />)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const abbr = r.teamId != null ? ID_TO_ABBR[r.teamId] : undefined
              const logo = r.teamId != null ? mlbTeamLogo(r.teamId) : undefined
              const handColor = HAND_COLOR[r.bats] ?? 'var(--text-3)'
              const playerMarkets = marketsForPlayer(markets, r.mlb_id)
              const playerFlags = crossBookFlagsForPlayer(flags, r.mlb_id)
              const playerDataFlags = dataMismatchFlagsForPlayer(dataFlags, r.mlb_id)
              const isOpen = expanded.has(r.mlb_id)
              return (
                <>
                  <tr key={r.mlb_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', position: 'sticky', left: 0, background: 'var(--surface)' }}>
                      <button onClick={() => onToggleExpand(r.mlb_id)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        <PlayerAvatar headshot={mlbHeadshot(r.mlb_id)} teamLogo={logo} teamAbbr={abbr} name={r.name} size={28} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{r.name}</span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: handColor, border: `1px solid ${handColor}`, borderRadius: 4, padding: '1px 4px' }}>{r.bats}</span>
                        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{r.position}</span>
                        {playerFlags.length > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />}
                        {playerDataFlags.length > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171', flexShrink: 0 }} />}
                        {playerMarkets.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)' }}>{playerMarkets.length} mkts {isOpen ? '▲' : '▼'}</span>}
                      </button>
                    </td>
                    {selectedPitcher && (
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: "'SF Mono',monospace", ...heat((r as any).edge, g('edge')) }}>
                        {fmt((r as any).edge)}
                      </td>
                    )}
                    {BATTER_COLS.map(c => (
                      <td key={c.key as string} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', fontFamily: "'SF Mono',monospace", ...heat(r[c.key] as number | null, g(c.key as string), c.dir) }}>
                        {fmt(r[c.key] as number | null, c.dec ?? 1)}
                      </td>
                    ))}
                  </tr>
                  {isOpen && (
                    <tr key={`${r.mlb_id}-exp`}>
                      <td colSpan={BATTER_COLS.length + 1 + (selectedPitcher ? 1 : 0)} style={{ padding: '10px 16px', background: 'var(--surface-2)' }}>
                        {playerMarkets.length === 0 ? (
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>No markets loaded for {r.name} yet.</span>
                        ) : (
                          playerMarkets.map(({ market, option }, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, padding: '4px 0', maxWidth: 520 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
                                <BookLogo vendor={market.book} size={14} />
                                {market.title} — {option.label}
                              </span>
                              <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{option.odds > 0 ? `+${option.odds}` : option.odds}</span>
                            </div>
                          ))
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LeaguePitcherTable({ league, rows, pool, sort, onSort }: { league: 'AL' | 'NL'; rows: PitcherRow[]; pool: PitcherRow[]; sort: SortState; onSort: (col: string) => void }) {
  const g = (f: string) => pool.map((r: any) => r[f])
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 900, padding: '3px 8px', borderRadius: 6,
          background: league === 'AL' ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
          color: league === 'AL' ? '#f87171' : '#60a5fa',
        }}>{league === 'AL' ? 'AMERICAN LEAGUE' : 'NATIONAL LEAGUE'}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{rows.length} pitchers</span>
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--border)', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', position: 'sticky', left: 0, background: 'var(--surface-2)' }}>Pitcher</th>
              {PITCHER_COLS.map(c => <TH key={c.key as string} label={c.label} title={c.title} sortKey={c.key as string} sort={sort} onSort={onSort} />)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const abbr = r.teamId != null ? ID_TO_ABBR[r.teamId] : undefined
              const logo = r.teamId != null ? mlbTeamLogo(r.teamId) : undefined
              const handColor = HAND_COLOR[r.throws] ?? 'var(--text-3)'
              return (
                <tr key={r.mlb_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px', position: 'sticky', left: 0, background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PlayerAvatar headshot={mlbHeadshot(r.mlb_id)} teamLogo={logo} teamAbbr={abbr} name={r.name} size={28} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{r.name}</span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: handColor, border: `1px solid ${handColor}`, borderRadius: 4, padding: '1px 4px' }}>{r.throws}HP</span>
                    </div>
                  </td>
                  {PITCHER_COLS.map(c => (
                    <td key={c.key as string} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', fontFamily: "'SF Mono',monospace", ...heat(r[c.key] as number | null, g(c.key as string), c.dir) }}>
                      {fmt(r[c.key] as number | null, c.dec ?? 1)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Every named selection gets a real headshot + team logo (via PlayerAvatar,
// looked up by the option's mlbId against tonight's roster) instead of bare
// text — team/total/over-under selections without an mlbId just show text.
function MarketOptionsList({
  options, title, rosterById, flags, dataFlags, containmentFlags,
}: {
  options: MarketOption[]; title: string; rosterById: Map<number, Roster>
  flags: ReturnType<typeof computeCrossBookFlags>; dataFlags: ReturnType<typeof computeMarketVsDataFlags>
  containmentFlags: ReturnType<typeof computeContainmentFlags>
}) {
  const [dir, setDir] = useState<'desc' | 'asc'>('desc')
  const sorted = devig(options)
  const rows = dir === 'desc' ? sorted : [...sorted].reverse()
  const canonKey = canonicalizeTitle(title)
  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button
          onClick={() => setDir(d => (d === 'desc' ? 'asc' : 'desc'))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 800, color: 'var(--text-3)', padding: 0 }}
        >
          Sort: {dir === 'desc' ? 'Favorite first ▼' : 'Longshot first ▲'}
        </button>
      </div>
      {rows.map((o, i) => {
        const player = o.mlbId != null ? rosterById.get(o.mlbId) : undefined
        const abbr = player?.teamId != null ? ID_TO_ABBR[player.teamId] : undefined
        const logo = player?.teamId != null ? mlbTeamLogo(player.teamId) : undefined
        const flagged = o.mlbId != null && canonKey != null && (
          flags.some(f => f.key === canonKey && f.mlbId === o.mlbId) ||
          dataFlags.some(f => f.key === canonKey && f.mlbId === o.mlbId) ||
          containmentFlags.some(f => f.mlbId === o.mlbId && (f.narrowKey === canonKey || f.broadKey === canonKey))
        )
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, padding: '4px 0' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', minWidth: 0 }}>
              {flagged && <span style={{ flexShrink: 0 }}>🚩</span>}
              {player && <PlayerAvatar headshot={mlbHeadshot(player.mlb_id)} teamLogo={logo} teamAbbr={abbr} name={player.name} size={18} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
            </span>
            <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <span style={{ color: 'var(--text-3)' }}>{(o.prob * 100).toFixed(1)}%</span>
              <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{o.odds > 0 ? `+${o.odds}` : o.odds}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function BookMarketsPanel({
  book, markets, rosterById, flags, dataFlags, containmentFlags,
}: {
  book: Sportsbook; markets: Market[]; rosterById: Map<number, Roster>
  flags: ReturnType<typeof computeCrossBookFlags>; dataFlags: ReturnType<typeof computeMarketVsDataFlags>
  containmentFlags: ReturnType<typeof computeContainmentFlags>
}) {
  const [query, setQuery] = useState('')
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  const [openMarkets, setOpenMarkets] = useState<Set<string>>(new Set())
  const filtered = searchMarkets(markets, query)
  const grouped = groupBySection(filtered)
  const sectionNames = Object.keys(grouped)

  return (
    <div style={{ marginBottom: 24, border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <BookLogo vendor={book} size={24} />
        <h3 style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>{BOOK_LABEL[book]}</h3>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{markets.length} market{markets.length !== 1 ? 's' : ''}</span>
      </div>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={`Search ${BOOK_LABEL[book]} markets, players, props…`}
        className="ss-input"
        style={{ width: '100%', marginBottom: 16 }}
      />
      {markets.length === 0 ? (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 14, padding: '28px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 4 }}>No {BOOK_LABEL[book]} markets loaded yet</p>
        </div>
      ) : sectionNames.map(section => (
        <div key={section} style={{ marginBottom: 10, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <button
            onClick={() => setOpenSections(s => { const n = new Set(s); n.has(section) ? n.delete(section) : n.add(section); return n })}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--surface)', border: 'none', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{section}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{grouped[section].length} · {openSections.has(section) ? '▲' : '▼'}</span>
          </button>
          {openSections.has(section) && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {grouped[section].map(m => (
                <div key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <button
                    onClick={() => setOpenMarkets(s => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n })}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {(() => {
                        const key = canonicalizeTitle(m.title)
                        const has = key != null && m.options.some(o =>
                          o.mlbId != null && (
                            flags.some(f => f.key === key && f.mlbId === o.mlbId) ||
                            dataFlags.some(f => f.key === key && f.mlbId === o.mlbId) ||
                            containmentFlags.some(f => f.mlbId === o.mlbId && (f.narrowKey === key || f.broadKey === key))
                          )
                        )
                        return has ? <span>🚩</span> : null
                      })()}
                      {m.title}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.options.length} · {openMarkets.has(m.id) ? '▲' : '▼'}</span>
                  </button>
                  {openMarkets.has(m.id) && <MarketOptionsList options={m.options} title={m.title} rosterById={rosterById} flags={flags} dataFlags={dataFlags} containmentFlags={containmentFlags} />}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function AllStarClient() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [hand, setHand] = useState<'R' | 'L'>('R')
  const [batterSort, setBatterSort] = useState<SortState>({ col: 's_hr', dir: 'desc' })
  const [pitcherSort, setPitcherSort] = useState<SortState>({ col: 'hr_total', dir: 'desc' })
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetch('/api/allstar/data')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('Failed to load All-Star Game data'))
  }, [])

  if (error) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>{error}</div>
  }
  if (!data) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>Loading All-Star Game data…</div>
  }

  const alRoster: Roster[] = data.rosters?.AL ?? []
  const nlRoster: Roster[] = data.rosters?.NL ?? []

  const alBatterRoster = alRoster.filter(p => p.position !== 'P')
  const nlBatterRoster = nlRoster.filter(p => p.position !== 'P')
  // Baseline (global-hand) build — used only for the HR power ranking below;
  // each LeagueBatterTable rebuilds its own rows internally once a specific
  // opposing pitcher is selected.
  const allBatterPool = [...alBatterRoster, ...nlBatterRoster].map(p => buildBatterRow(p, hand, data.statSplits, data.timingSplits))

  const alPitcherRoster = alRoster.filter(p => p.position === 'P')
  const nlPitcherRoster = nlRoster.filter(p => p.position === 'P')
  const alPitchers = alPitcherRoster.map(p => buildPitcherRow(p, hand, data.pitcherSplits))
  const nlPitchers = nlPitcherRoster.map(p => buildPitcherRow(p, hand, data.pitcherSplits))
  const allPitcherPool = [...alPitchers, ...nlPitchers]

  const allMarkets: Market[] = data.markets ?? []
  const bookMarkets = groupByBook(allMarkets)

  const rosterById = new Map<number, Roster>([...alRoster, ...nlRoster].map(p => [p.mlb_id, p]))

  // Real, mechanical cross-book disagreement — computed straight off the
  // three scraped boards (see allStarMarkets.ts), not a fabricated signal.
  const crossBookFlags = computeCrossBookFlags(allMarkets)

  // The actual ask: does the market's consensus price for HR-family props
  // (the only props with a real tracked season number on this page — xHR/HR
  // total) line up with who our own bat-tracking data says is the biggest
  // real threat. Ranked off season xHR (falls back to raw HR total).
  const powerRanked = [...allBatterPool]
    .filter(r => r.s_xhr != null || r.s_hr != null)
    .sort((a, b) => (b.s_xhr ?? b.s_hr ?? 0) - (a.s_xhr ?? a.s_hr ?? 0))
  const realRankByMlbId = new Map<number, number>()
  powerRanked.forEach((r, i) => realRankByMlbId.set(r.mlb_id, i + 1))
  const dataMismatchFlags = computeMarketVsDataFlags(allMarkets, realRankByMlbId)

  // Real logical containment across markets for the same player (a HR
  // guarantees a hit/run/RBI/4 total bases; "first HR of the game" requires
  // "hits a HR" at all) — pure arithmetic on the scraped prices, flags any
  // book pricing the stricter/narrower event as MORE likely than the
  // broader event it's contained in.
  const reserveMlbIds = computeReserveMlbIds(allMarkets)
  const containmentFlags = computeContainmentFlags(allMarkets, reserveMlbIds)

  const toggleExpand = (id: number) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const gameDateLabel = data.gameDate
    ? new Date(data.gameDate).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'
    : ''

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 16px 60px' }}>
      {/* Header */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, border: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(180,255,77,0.07), var(--surface))', padding: '32px 24px', marginBottom: 28 }}>
        <Spotlight className="left-0 top-0" fill="#B4FF4D" />
        <Meteors number={10} className="opacity-40" />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>One Night Only</span>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em', margin: '4px 0' }}>2026 MLB All-Star Game</h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 2 }}>American League vs National League</p>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{data.venue} · Philadelphia, PA{gameDateLabel ? ` · ${gameDateLabel}` : ''}</p>
        </div>
      </div>

      {/* Hand toggle */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Splits vs</span>
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 2 }}>
          {(['R', 'L'] as const).map(h => (
            <button
              key={h}
              onClick={() => setHand(h)}
              style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer',
                background: hand === h ? 'var(--accent)' : 'transparent', color: hand === h ? 'var(--accent-fg)' : 'var(--text-3)',
              }}
            >{h === 'R' ? 'RHP / RHB' : 'LHP / LHB'}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>No fixed opposing pitcher tonight — this shows each player's own real season split vs that hand.</span>
      </div>

      {/* Section 1: Bat tracking board */}
      <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)', marginBottom: 12 }}>Bat Tracking Board</h2>
      <LeagueBatterTable league="AL" batterRoster={alBatterRoster} hand={hand} sort={batterSort} onSort={col => toggleSort(setBatterSort, col)} expanded={expanded} onToggleExpand={toggleExpand} markets={allMarkets} flags={crossBookFlags} dataFlags={dataMismatchFlags} opposingPitchers={nlPitcherRoster} statSplits={data.statSplits} timingSplits={data.timingSplits} batterPitchRecent={data.batterPitchRecent ?? []} pitcherPitchRecent={data.pitcherPitchRecent ?? []} />
      <LeagueBatterTable league="NL" batterRoster={nlBatterRoster} hand={hand} sort={batterSort} onSort={col => toggleSort(setBatterSort, col)} expanded={expanded} onToggleExpand={toggleExpand} markets={allMarkets} flags={crossBookFlags} dataFlags={dataMismatchFlags} opposingPitchers={alPitcherRoster} statSplits={data.statSplits} timingSplits={data.timingSplits} batterPitchRecent={data.batterPitchRecent ?? []} pitcherPitchRecent={data.pitcherPitchRecent ?? []} />

      {/* Pitching staffs */}
      <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)', margin: '28px 0 12px' }}>Pitching Staffs</h2>
      <LeaguePitcherTable league="AL" rows={sortRows(alPitchers, pitcherSort)} pool={allPitcherPool} sort={pitcherSort} onSort={col => toggleSort(setPitcherSort, col)} />
      <LeaguePitcherTable league="NL" rows={sortRows(nlPitchers, pitcherSort)} pool={allPitcherPool} sort={pitcherSort} onSort={col => toggleSort(setPitcherSort, col)} />

      {/* Section 2: Sportsbook markets — one panel per book, logos not text */}
      <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)', margin: '28px 0 12px' }}>Sportsbook Markets</h2>
      <BookMarketsPanel book="fanduel" markets={bookMarkets.fanduel} rosterById={rosterById} flags={crossBookFlags} dataFlags={dataMismatchFlags} containmentFlags={containmentFlags} />
      <BookMarketsPanel book="betmgm" markets={bookMarkets.betmgm} rosterById={rosterById} flags={crossBookFlags} dataFlags={dataMismatchFlags} containmentFlags={containmentFlags} />
      <BookMarketsPanel book="caesars" markets={bookMarkets.caesars} rosterById={rosterById} flags={crossBookFlags} dataFlags={dataMismatchFlags} containmentFlags={containmentFlags} />
    </div>
  )
}
