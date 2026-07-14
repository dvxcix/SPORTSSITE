'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Spotlight } from '@/components/ui/spotlight'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { mlbHeadshot, mlbTeamLogo } from '@/lib/mlb-api'
import { MLB_TEAM_IDS } from '@/lib/mlbTeamColors'
import { ALLSTAR_MARKETS, marketsForPlayer, groupBySection, searchMarkets, devig, type Market } from '@/lib/allStarMarkets'

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
  league, teamName, rows, pool, sort, onSort, expanded, onToggleExpand, markets,
}: {
  league: 'AL' | 'NL'; teamName: string; rows: BatterRow[]; pool: BatterRow[]
  sort: SortState; onSort: (col: string) => void
  expanded: Set<number>; onToggleExpand: (id: number) => void; markets: Market[]
}) {
  const g = (f: string) => pool.map((r: any) => r[f])
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 900, padding: '3px 8px', borderRadius: 6,
          background: league === 'AL' ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
          color: league === 'AL' ? '#f87171' : '#60a5fa',
        }}>{league === 'AL' ? 'AMERICAN LEAGUE' : 'NATIONAL LEAGUE'}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{rows.length} batters</span>
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--border)', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', position: 'sticky', left: 0, background: 'var(--surface-2)' }}>Player</th>
              {BATTER_COLS.map(c => <TH key={c.key as string} label={c.label} title={c.title} sortKey={c.key as string} sort={sort} onSort={onSort} />)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const abbr = r.teamId != null ? ID_TO_ABBR[r.teamId] : undefined
              const logo = r.teamId != null ? mlbTeamLogo(r.teamId) : undefined
              const handColor = HAND_COLOR[r.bats] ?? 'var(--text-3)'
              const playerMarkets = marketsForPlayer(markets, r.mlb_id)
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
                        {playerMarkets.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)' }}>{playerMarkets.length} mkts {isOpen ? '▲' : '▼'}</span>}
                      </button>
                    </td>
                    {BATTER_COLS.map(c => (
                      <td key={c.key as string} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', fontFamily: "'SF Mono',monospace", ...heat(r[c.key] as number | null, g(c.key as string), c.dir) }}>
                        {fmt(r[c.key] as number | null, c.dec ?? 1)}
                      </td>
                    ))}
                  </tr>
                  {isOpen && (
                    <tr key={`${r.mlb_id}-exp`}>
                      <td colSpan={BATTER_COLS.length + 1} style={{ padding: '10px 16px', background: 'var(--surface-2)' }}>
                        {playerMarkets.length === 0 ? (
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>No FanDuel markets loaded for {r.name} yet.</span>
                        ) : (
                          playerMarkets.map(({ market, option }, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '4px 0', maxWidth: 480 }}>
                              <span style={{ color: 'var(--text-2)' }}>{market.title} — {option.label}</span>
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

function MarketsSection({ markets }: { markets: Market[] }) {
  const [query, setQuery] = useState('')
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  const [openMarkets, setOpenMarkets] = useState<Set<string>>(new Set())
  const filtered = searchMarkets(markets, query)
  const grouped = groupBySection(filtered)
  const sectionNames = Object.keys(grouped)

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)' }}>FanDuel Markets</h2>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{markets.length} market{markets.length !== 1 ? 's' : ''} loaded</span>
      </div>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search markets, players, props…"
        className="ss-input"
        style={{ width: '100%', marginBottom: 16 }}
      />
      {markets.length === 0 ? (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 14, padding: '28px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 4 }}>No markets loaded yet</p>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', maxWidth: 460, margin: '0 auto', lineHeight: 1.5 }}>
            The All-Star Game's FanDuel board doesn't run through the normal per-game importer — it's a one-night event with its own market set.
            Paste the real scraped markets/odds and they'll populate here, searchable and broken out per player, same as the stat board above.
          </p>
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
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{m.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.options.length} · {openMarkets.has(m.id) ? '▲' : '▼'}</span>
                  </button>
                  {openMarkets.has(m.id) && (
                    <div style={{ padding: '0 16px 12px' }}>
                      {devig(m.options).map((o, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '4px 0' }}>
                          <span style={{ color: 'var(--text-2)' }}>{o.label}</span>
                          <span style={{ display: 'flex', gap: 8 }}>
                            <span style={{ color: 'var(--text-3)' }}>{(o.prob * 100).toFixed(1)}%</span>
                            <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{o.odds > 0 ? `+${o.odds}` : o.odds}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
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

  const alBatters = alRoster.filter(p => p.position !== 'P').map(p => buildBatterRow(p, hand, data.statSplits, data.timingSplits))
  const nlBatters = nlRoster.filter(p => p.position !== 'P').map(p => buildBatterRow(p, hand, data.statSplits, data.timingSplits))
  const allBatterPool = [...alBatters, ...nlBatters]

  const alPitchers = alRoster.filter(p => p.position === 'P').map(p => buildPitcherRow(p, hand, data.pitcherSplits))
  const nlPitchers = nlRoster.filter(p => p.position === 'P').map(p => buildPitcherRow(p, hand, data.pitcherSplits))
  const allPitcherPool = [...alPitchers, ...nlPitchers]

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
      <LeagueBatterTable league="AL" teamName="American League" rows={sortRows(alBatters, batterSort)} pool={allBatterPool} sort={batterSort} onSort={col => toggleSort(setBatterSort, col)} expanded={expanded} onToggleExpand={toggleExpand} markets={ALLSTAR_MARKETS} />
      <LeagueBatterTable league="NL" teamName="National League" rows={sortRows(nlBatters, batterSort)} pool={allBatterPool} sort={batterSort} onSort={col => toggleSort(setBatterSort, col)} expanded={expanded} onToggleExpand={toggleExpand} markets={ALLSTAR_MARKETS} />

      {/* Pitching staffs */}
      <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)', margin: '28px 0 12px' }}>Pitching Staffs</h2>
      <LeaguePitcherTable league="AL" rows={sortRows(alPitchers, pitcherSort)} pool={allPitcherPool} sort={pitcherSort} onSort={col => toggleSort(setPitcherSort, col)} />
      <LeaguePitcherTable league="NL" rows={sortRows(nlPitchers, pitcherSort)} pool={allPitcherPool} sort={pitcherSort} onSort={col => toggleSort(setPitcherSort, col)} />

      {/* Section 2: FanDuel markets */}
      <MarketsSection markets={ALLSTAR_MARKETS} />
    </div>
  )
}
