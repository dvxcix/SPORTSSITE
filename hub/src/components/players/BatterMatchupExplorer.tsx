'use client'

import { useMemo, useState } from 'react'
import { pitchLabel } from '@/lib/mlb-api'
import { cardStyle, sectionTitleStyle, windowTag, ToggleBtn, DimChip, StatGrid } from './PlayerPageClient'

export type BatterPitchRow = {
  game_pk: string; game_date: string; pitcher_id: number; batter_id: number
  pitch_type: string | null; zone: number | null
  events: string | null
  is_in_play: boolean; is_swing: boolean; is_whiff: boolean
  launch_speed: number | null; launch_angle: number | null; xwoba: number | null
  p_throws: string | null
  opponent_id: number; opponent_name: string; day_night: string | null
}

const r3 = (v: number | null) => (v == null ? '—' : v.toFixed(3))
const d1 = (v: number | null) => (v == null ? '—' : v.toFixed(1))
const p1 = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`)
const i0 = (v: number | null) => (v == null ? '—' : String(Math.round(v)))

// Real counting stats straight off the event log — Savant's own `events`
// column is populated only on the pitch that ends a plate appearance, so
// counting occurrences here IS the real season total for whatever subset
// is currently filtered, no separate boxscore/game-log needed.
function computeStats(rows: BatterPitchRow[]) {
  const pitches = rows.length
  const games = new Set(rows.map(r => r.game_date)).size
  const swings = rows.filter(r => r.is_swing)
  const whiffs = rows.filter(r => r.is_whiff)
  const inPlay = rows.filter(r => r.is_in_play)
  const withEv = inPlay.filter((r): r is BatterPitchRow & { launch_speed: number } => r.launch_speed != null)
  const withLa = inPlay.filter((r): r is BatterPitchRow & { launch_angle: number } => r.launch_angle != null)
  const hardHit = withEv.filter(r => r.launch_speed >= 95)
  const withXwoba = inPlay.filter((r): r is BatterPitchRow & { xwoba: number } => r.xwoba != null)

  const events = rows.map(r => r.events).filter((e): e is string => !!e)
  const cnt = (name: string) => events.filter(e => e === name).length
  const bb = cnt('walk') + cnt('intent_walk')
  const hbp = cnt('hit_by_pitch')
  const k = cnt('strikeout') + cnt('strikeout_double_play')
  const single = cnt('single'), double = cnt('double'), triple = cnt('triple'), hr = cnt('home_run')
  const hits = single + double + triple + hr
  const sacFly = cnt('sac_fly') + cnt('sac_fly_double_play')
  const sacBunt = cnt('sac_bunt') + cnt('sac_bunt_double_play')
  const pa = events.length
  const ab = pa - bb - hbp - sacFly - sacBunt
  const obpDenom = ab + bb + hbp + sacFly
  const totalBases = single + 2 * double + 3 * triple + 4 * hr

  return {
    pitches, games, pa, ab, hits, bb, k, hr,
    avg: ab > 0 ? hits / ab : null,
    obp: obpDenom > 0 ? (hits + bb + hbp) / obpDenom : null,
    slg: ab > 0 ? totalBases / ab : null,
    bbPerGame: games > 0 ? bb / games : null,
    kPct: pa > 0 ? (k / pa) * 100 : null,
    swingPct: pitches > 0 ? (swings.length / pitches) * 100 : null,
    whiffPct: swings.length > 0 ? (whiffs.length / swings.length) * 100 : null,
    bbe: inPlay.length,
    avgEv: withEv.length ? withEv.reduce((a, r) => a + r.launch_speed, 0) / withEv.length : null,
    maxEv: withEv.length ? Math.max(...withEv.map(r => r.launch_speed)) : null,
    avgLa: withLa.length ? withLa.reduce((a, r) => a + r.launch_angle, 0) / withLa.length : null,
    hardHitPct: withEv.length ? (hardHit.length / withEv.length) * 100 : null,
    xwobaContact: withXwoba.length ? withXwoba.reduce((a, r) => a + r.xwoba, 0) / withXwoba.length : null,
  }
}

const RECENCY_OPTIONS = [
  { key: 'season', label: 'Season' },
  { key: '30', label: 'Last 30 Games' },
  { key: '15', label: 'Last 15 Games' },
  { key: '7', label: 'Last 7 Games' },
] as const

const selectStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)',
}

// Fully custom batter split builder — pick any combination of opponent
// pitcher, pitcher hand, day/night, recency window, and pitch type, and the
// resulting batting line / plate discipline / batted-ball quality
// recompute live. Everything is filtered client-side over the season's raw
// pitch log, same pattern as the split explorers above.
export function BatterMatchupExplorer({ rows }: { rows: BatterPitchRow[] }) {
  const [recency, setRecency] = useState<typeof RECENCY_OPTIONS[number]['key']>('season')
  const [handSel, setHandSel] = useState<'all' | 'L' | 'R'>('all')
  const [dayNightSel, setDayNightSel] = useState<'all' | 'day' | 'night'>('all')
  const [pitchTypeSel, setPitchTypeSel] = useState('all')
  const [opponentSel, setOpponentSel] = useState('all')

  const allGameDates = useMemo(() => Array.from(new Set(rows.map(r => r.game_date))).sort(), [rows])
  const pitchTypes = useMemo(() => Array.from(new Set(rows.map(r => r.pitch_type).filter((v): v is string => !!v))), [rows])
  const opponents = useMemo(() => {
    const counts = new Map<number, { name: string; pitches: number }>()
    for (const r of rows) {
      const e = counts.get(r.opponent_id)
      if (e) e.pitches++
      else counts.set(r.opponent_id, { name: r.opponent_name, pitches: 1 })
    }
    return Array.from(counts, ([id, v]) => ({ id, ...v })).sort((a, b) => b.pitches - a.pitches)
  }, [rows])

  if (!rows.length) return null

  // Recency is resolved against the player's real last-N-games-played
  // calendar, independent of the other filters — "his last 15 games, vs
  // LHP" means the 15 most recent games he played, not the 15 most recent
  // games matching every other filter.
  const recentDates = recency === 'season' ? null : new Set(allGameDates.slice(-Number(recency)))

  const filtered = rows.filter(r =>
    (recentDates === null || recentDates.has(r.game_date)) &&
    (handSel === 'all' || r.p_throws === handSel) &&
    (dayNightSel === 'all' || r.day_night === dayNightSel) &&
    (pitchTypeSel === 'all' || r.pitch_type === pitchTypeSel) &&
    (opponentSel === 'all' || String(r.opponent_id) === opponentSel)
  )
  const s = computeStats(filtered)

  return (
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>
        Matchup Explorer
        <span style={windowTag}>{s.pitches.toLocaleString()} pitches · {s.games} game{s.games === 1 ? '' : 's'}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        {RECENCY_OPTIONS.map(o => <ToggleBtn key={o.key} active={recency === o.key} onClick={() => setRecency(o.key)}>{o.label}</ToggleBtn>)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Pitcher hand:</span>
        <DimChip label="All" active={handSel === 'all'} onClick={() => setHandSel('all')} />
        <DimChip label="vs RHP" active={handSel === 'R'} onClick={() => setHandSel('R')} />
        <DimChip label="vs LHP" active={handSel === 'L'} onClick={() => setHandSel('L')} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Game:</span>
        <DimChip label="All" active={dayNightSel === 'all'} onClick={() => setDayNightSel('all')} />
        <DimChip label="Day" active={dayNightSel === 'day'} onClick={() => setDayNightSel('day')} />
        <DimChip label="Night" active={dayNightSel === 'night'} onClick={() => setDayNightSel('night')} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Pitch:</span>
        <DimChip label="All" active={pitchTypeSel === 'all'} onClick={() => setPitchTypeSel('all')} />
        {pitchTypes.map(pt => (
          <DimChip key={pt} label={pitchLabel(pt)} active={pitchTypeSel === pt} onClick={() => setPitchTypeSel(pt)} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Vs. pitcher:</span>
        <select value={opponentSel} onChange={e => setOpponentSel(e.target.value)} style={selectStyle}>
          <option value="all">All pitchers</option>
          {opponents.map(o => (
            <option key={o.id} value={String(o.id)}>{o.name} ({o.pitches})</option>
          ))}
        </select>
      </div>

      {s.pitches === 0 ? (
        <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No pitches match this combination of filters.</div>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 8 }}>BATTING LINE</div>
          <StatGrid pairs={[
            ['PA', i0(s.pa)], ['AB', i0(s.ab)], ['H', i0(s.hits)], ['HR', i0(s.hr)],
            ['BB', i0(s.bb)], ['K', i0(s.k)], ['K %', p1(s.kPct)], ['BB/Game', d1(s.bbPerGame)],
            ['AVG', r3(s.avg)], ['OBP', r3(s.obp)], ['SLG', r3(s.slg)],
          ]} />
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', margin: '16px 0 8px' }}>PLATE DISCIPLINE</div>
          <StatGrid pairs={[
            ['Pitches', i0(s.pitches)], ['Swing %', p1(s.swingPct)], ['Whiff %', p1(s.whiffPct)],
          ]} />
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', margin: '16px 0 8px' }}>BATTED BALL</div>
          <StatGrid pairs={[
            ['BBE', i0(s.bbe)], ['Avg EV', d1(s.avgEv)], ['Max EV', d1(s.maxEv)],
            ['Avg LA', d1(s.avgLa)], ['Hard-Hit %', p1(s.hardHitPct)], ['xwOBA (Contact)', r3(s.xwobaContact)],
          ]} />
        </>
      )}
    </div>
  )
}
