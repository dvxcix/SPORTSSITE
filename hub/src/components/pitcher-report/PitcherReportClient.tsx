'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { mlbHeadshot, pitchColor, pitchLabel } from '@/lib/mlb-api'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { Tooltip } from '@/components/ui/tooltip-card'
import { PitchMixTable, BatterVsPitchTable, TeamLogoImg, effectiveBatSide, pct } from './MatchupTables'

// ─── shapes from /api/dugout/data ──────────────────────────────────────────
interface PitcherInfo { id: number; name: string; hand: string }
interface LineupPlayer {
  mlb_id: number; name: string; name_norm: string
  batting_order: number; position: string; bats: string
  team: string; team_name: string; projected: boolean
  props?: any
}
interface Game {
  gamePk: number; gameKey: string; gameNum: number
  homeTeam: string; awayTeam: string; homeAbbr: string; awayAbbr: string
  gameDate: string; status: string
  homePitcher: PitcherInfo | null; awayPitcher: PitcherInfo | null
  homeLineupConfirmed: boolean; awayLineupConfirmed: boolean
  homeLineup: LineupPlayer[]; awayLineup: LineupPlayer[]
}
interface DugoutData {
  date: string; games: Game[]; pitcherPitchRecent: any[]; batterPitchRecent: any[]
  statSplits: any[]; timingSplits: any[]; pitcherSplits: any[]; pikkit: any[]
}

interface StarterOption {
  key: string
  pitcher: PitcherInfo
  teamAbbr: string; teamName: string
  oppAbbr: string; oppName: string
  oppLineup: LineupPlayer[]
  oppLineupConfirmed: boolean
}

// ─── pitch-type lookup maps — same shape/builders as DugoutClient's, kept
// local here rather than shared since neither is currently exported and this
// page's only dependency on them is the raw batterPitchRecent/pitcherPitchRecent
// arrays already in the /api/dugout/data response. ──────────────────────────
function buildPitcherPitchMap(rows: any[]) {
  const map: Record<string, Record<string, Record<string, any>>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    const pt = r.pitch_type || ''
    const hand = r.bat_hand || 'R'
    if (!id || !pt) continue
    if (!map[id]) map[id] = {}
    if (!map[id][pt]) map[id][pt] = {}
    map[id][pt][hand] = r
  }
  return map
}
function buildBatterPitchMap(rows: any[]) {
  const map: Record<string, Record<string, Record<string, any>>> = {}
  for (const r of rows) {
    const nn = r.name_norm || ''
    const pt = r.pitch_type || ''
    const hand = r.pitcher_hand || 'R'
    if (!nn || !pt) continue
    if (!map[nn]) map[nn] = {}
    if (!map[nn][pt]) map[nn][pt] = {}
    map[nn][pt][hand] = r
  }
  return map
}

// ─── full Statcast/bat-tracking builders — same shape/logic as DugoutClient's
// (not exported there either), needed to power the same BSpd/R·Spd/Timing/
// Sq/Blast/SwLen/Atk/Brl%/HH%/PullAir/FB%/EV/LA/xHR/HR section on player
// expand here. ────────────────────────────────────────────────────────────
function buildSplitMap(rows: any[]) {
  const byId: Record<string, Record<string, { season?: any; recent?: any }>> = {}
  const byName: Record<string, Record<string, { season?: any; recent?: any }>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    const hand = r.pitch_hand || 'R'
    const win = r.win || 'season'
    if (id) {
      if (!byId[id]) byId[id] = {}
      if (!byId[id][hand]) byId[id][hand] = {}
      ;(byId[id][hand] as any)[win] = r
    }
    const nn = r.name_norm || ''
    if (nn) {
      if (!byName[nn]) byName[nn] = {}
      if (!byName[nn][hand]) byName[nn][hand] = {}
      ;(byName[nn][hand] as any)[win] = r
    }
  }
  return { byId, byName }
}

function buildTimingMap(rows: any[]) {
  const byId: Record<string, Record<string, Record<string, { season?: any; recent?: any }>>> = {}
  const byName: Record<string, Record<string, Record<string, { season?: any; recent?: any }>>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    const hand = r.pitch_hand || 'R'
    const pt = r.pitch_type || ''
    const win = r.win || 'season'
    if (id && pt) {
      if (!byId[id]) byId[id] = {}
      if (!byId[id][hand]) byId[id][hand] = {}
      if (!byId[id][hand][pt]) byId[id][hand][pt] = {}
      ;(byId[id][hand][pt] as any)[win] = r
    }
    const nn = r.name_norm || ''
    if (nn && pt) {
      if (!byName[nn]) byName[nn] = {}
      if (!byName[nn][hand]) byName[nn][hand] = {}
      if (!byName[nn][hand][pt]) byName[nn][hand][pt] = {}
      ;(byName[nn][hand][pt] as any)[win] = r
    }
  }
  return { byId, byName }
}

function buildPitcherMap(rows: any[]) {
  const map: Record<string, Record<string, { season?: any; recent?: any }>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    if (!id) continue
    const hand = r.bat_hand || 'R'
    const win = r.win || 'season'
    if (!map[id]) map[id] = {}
    if (!map[id][hand]) map[id][hand] = {}
    ;(map[id][hand] as any)[win] = r
  }
  return map
}

// ─── formatting ─────────────────────────────────────────────────────────────
// Every rate field on batter_pitch_type_recent/pitcher_pitch_type_recent
// already comes out of mlb-party on a 0-100 scale (41.3 meaning 41.3%), not
// a 0-1 fraction — confirmed against real rows, not assumed.
const normName = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()

function windowLabel(rows: any[]): string {
  const r = rows.find(x => x.window_start && x.window_end)
  if (!r) return ''
  const start = new Date(r.window_start + 'T12:00:00Z')
  const end = new Date(r.window_end + 'T12:00:00Z')
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `Last ${days} days (${fmt(start)} – ${fmt(end)})`
}

// ─── date strip — same offset-anchored-at-UTC-noon pattern as Weather Lab's,
// duplicated rather than imported since neither page exports it yet. ────────
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}
function localToday(): string {
  return new Date().toLocaleDateString('en-CA')
}
function DateStrip({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const today = localToday()
  const days = [-2, -1, 0, 1, 2].map(offset => {
    const d = offsetDate(date, offset)
    const dt = new Date(d + 'T12:00:00Z')
    return {
      date: d, isSelected: d === date, isToday: d === today,
      dayName: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      dayNum: dt.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }),
    }
  })
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
      <button onClick={() => onChange(offsetDate(date, -1))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, flexShrink: 0, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--text-3)', fontSize: 18, fontWeight: 700, borderRight: '1px solid var(--border)' }}>‹</button>
      {days.map(({ date: d, isSelected, isToday, dayName, dayNum }) => (
        <button key={d} onClick={() => onChange(d)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', gap: 3, border: 'none', cursor: 'pointer', background: isSelected ? 'var(--accent)' : 'transparent', borderRight: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: isSelected ? 'var(--accent-fg)' : isToday ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{dayName}</span>
          <span style={{ fontSize: 12, fontWeight: isSelected || isToday ? 900 : 600, color: isSelected ? 'var(--accent-fg)' : 'var(--text-1)', whiteSpace: 'nowrap' }}>{dayNum}</span>
        </button>
      ))}
      <button onClick={() => onChange(offsetDate(date, 1))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, flexShrink: 0, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--text-3)', fontSize: 18, fontWeight: 700 }}>›</button>
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────────────
export function PitcherReportClient() {
  // Deep-link support (Dugout's opposing-pitcher chip links here with both
  // params) — date picks the right slate, pitcherId auto-selects that exact
  // starter once his game's data loads instead of defaulting to whoever's
  // first in the list.
  const searchParams = useSearchParams()
  const linkedPitcherId = searchParams.get('pitcherId')
  const [date, setDate] = useState<string>(() => searchParams.get('date') || localToday())
  const [data, setData] = useState<DugoutData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setData(null); setSelectedKey(null)
    fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [date])

  const starters: StarterOption[] = useMemo(() => {
    if (!data) return []
    const out: StarterOption[] = []
    for (const g of data.games) {
      if (g.awayPitcher) {
        out.push({
          key: `${g.gameKey}-away`, pitcher: g.awayPitcher,
          teamAbbr: g.awayAbbr, teamName: g.awayTeam,
          oppAbbr: g.homeAbbr, oppName: g.homeTeam,
          oppLineup: g.homeLineup, oppLineupConfirmed: g.homeLineupConfirmed,
        })
      }
      if (g.homePitcher) {
        out.push({
          key: `${g.gameKey}-home`, pitcher: g.homePitcher,
          teamAbbr: g.homeAbbr, teamName: g.homeTeam,
          oppAbbr: g.awayAbbr, oppName: g.awayTeam,
          oppLineup: g.awayLineup, oppLineupConfirmed: g.awayLineupConfirmed,
        })
      }
    }
    return out
  }, [data])

  useEffect(() => {
    if (selectedKey || !starters.length) return
    const linked = linkedPitcherId ? starters.find(s => String(s.pitcher.id) === linkedPitcherId) : null
    setSelectedKey((linked ?? starters[0]).key)
  }, [starters, selectedKey, linkedPitcherId])

  const selected = starters.find(s => s.key === selectedKey) ?? null

  const pitcherPitchMap = useMemo(() => buildPitcherPitchMap(data?.pitcherPitchRecent ?? []), [data?.pitcherPitchRecent])
  const batterPitchMap = useMemo(() => buildBatterPitchMap(data?.batterPitchRecent ?? []), [data?.batterPitchRecent])
  const splitMap = useMemo(() => buildSplitMap(data?.statSplits ?? []), [data?.statSplits])
  const timingMap = useMemo(() => buildTimingMap(data?.timingSplits ?? []), [data?.timingSplits])
  const statcastPitcherMap = useMemo(() => buildPitcherMap(data?.pitcherSplits ?? []), [data?.pitcherSplits])
  // A player can have one row per market (home_runs, singles, doubles...) —
  // prefer the home_runs row specifically, same as Dugout's own pikkitMap.
  const pikkitMap = useMemo(() => {
    const m: Record<string, any> = {}
    for (const r of (data?.pikkit ?? [])) {
      const nn = normName(r.player_name || '')
      if (!nn) continue
      const isHrRow = r.prop_type === 'home_runs' || r.market === 'home_runs'
      if (!m[nn] || isHrRow) m[nn] = r
    }
    return m
  }, [data?.pikkit])

  // 14-day pre-aggregated window (mlb-party) — the default, cheap source.
  const dayWindowRows = useMemo(() => {
    if (!selected) return { R: [] as any[], L: [] as any[] }
    const byType = pitcherPitchMap[String(selected.pitcher.id)] ?? {}
    const R: any[] = [], L: any[] = []
    for (const pt of Object.keys(byType)) {
      if (byType[pt].R) R.push(byType[pt].R)
      if (byType[pt].L) L.push(byType[pt].L)
    }
    return { R, L }
  }, [pitcherPitchMap, selected])

  // True "last N starts" / "last N games" window — computed live from MLB's
  // free Gumbo feed (src/lib/pitchLog.ts) rather than read from a
  // pre-aggregated table, since only a single fixed 14-day window exists
  // there. Heavier (fetches game feeds), so it's opt-in via the toggle below
  // rather than the default.
  const [windowMode, setWindowMode] = useState<'14day' | 'live'>('14day')
  const [liveN, setLiveN] = useState(3)
  const [liveData, setLiveData] = useState<{ window: { games: number; dateFrom: string | null; dateTo: string | null }; pitcherRows: { R: any[]; L: any[] }; batters: Record<string, Record<string, { R?: any; L?: any }>> } | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState('')

  useEffect(() => {
    if (windowMode !== 'live' || !selected) { setLiveData(null); return }
    let cancelled = false
    setLiveLoading(true); setLiveError(''); setLiveData(null)
    const batterIds = selected.oppLineup.map(p => p.mlb_id).join(',')
    const season = new Date(date + 'T12:00:00Z').getUTCFullYear()
    fetch(`/api/pitcher-report/live-window?pitcherId=${selected.pitcher.id}&batterIds=${batterIds}&games=${liveN}&season=${season}`, { cache: 'no-store' })
      .then(async r => {
        const body = await r.json()
        if (!r.ok) throw new Error(body?.error || 'Failed to compute live window')
        return body
      })
      .then(d => { if (!cancelled) setLiveData(d) })
      .catch(e => { if (!cancelled) setLiveError(e?.message || 'Failed to compute live window') })
      .finally(() => { if (!cancelled) setLiveLoading(false) })
    return () => { cancelled = true }
  }, [windowMode, liveN, selected, date])

  const activeRows = windowMode === 'live'
    ? (liveData ? { R: liveData.pitcherRows.R, L: liveData.pitcherRows.L } : { R: [] as any[], L: [] as any[] })
    : dayWindowRows

  const allRows = [...activeRows.R, ...activeRows.L]
  const winLabel = windowMode === 'live'
    ? (liveData ? `Last ${liveData.window.games} starts (${liveData.window.dateFrom} – ${liveData.window.dateTo})` : '')
    : windowLabel(allRows)

  // "Getting hit lately" — for each hand bucket, the pitcher's own pitches
  // with a real sample (>=10 tracked) ranked by how hard they're being hit,
  // not by how often he throws them. This is the whole point of the page:
  // surface what to attack, not just what he throws most.
  const hotPitches = useMemo(() => {
    if (!selected) return [] as { hand: 'R' | 'L'; pitchType: string; row: any }[]
    const out: { hand: 'R' | 'L'; pitchType: string; row: any }[] = []
    for (const hand of ['R', 'L'] as const) {
      const rows = activeRows[hand].filter(r => (r.pitches ?? 0) >= 10)
      const ranked = [...rows].sort((a, b) => {
        const sa = (a.barrel_pct ?? 0) * 1.5 + (a.hard_hit_pct ?? 0)
        const sb = (b.barrel_pct ?? 0) * 1.5 + (b.hard_hit_pct ?? 0)
        return sb - sa
      })
      for (const r of ranked.slice(0, 2)) out.push({ hand, pitchType: r.pitch_type, row: r })
    }
    return out
  }, [activeRows, selected])

  // Manual overrides — a pitch that didn't crack the auto top-2 (e.g. a
  // real HR on a small sample that scored lower than two higher-volume
  // pitches) shouldn't be unreachable just because the auto-ranker didn't
  // pick it. Click any pitch-mix row to pin/unpin its breakdown here too.
  const [pinned, setPinned] = useState<{ hand: 'R' | 'L'; pitchType: string }[]>([])
  useEffect(() => { setPinned([]) }, [selected?.key, windowMode, liveN])
  const onTogglePin = (hand: 'R' | 'L', pitchType: string) => {
    setPinned(prev => prev.some(p => p.hand === hand && p.pitchType === pitchType)
      ? prev.filter(p => !(p.hand === hand && p.pitchType === pitchType))
      : [...prev, { hand, pitchType }])
  }
  const pinnedByHand = {
    R: new Set(pinned.filter(p => p.hand === 'R').map(p => p.pitchType)),
    L: new Set(pinned.filter(p => p.hand === 'L').map(p => p.pitchType)),
  }
  // "Show all" bypasses curation entirely — every pitch/hand combo the
  // pitcher has thrown at all, full stop. What "we should be able to see
  // all" actually means: don't make me discover pitches one click at a
  // time, give me the option to just see everything.
  const [showAll, setShowAll] = useState(false)
  useEffect(() => { setShowAll(false) }, [selected?.key, windowMode, liveN])
  // Pinning is exclusive, not additive: as soon as anything is pinned, that
  // becomes the whole view — auto top-2 and "show all" both stand down until
  // every pin is cleared. Pinning is a deliberate "just show me THIS" action,
  // and mixing it back in with the auto-picked pitches buried the thing you
  // just went out of your way to select among stuff you didn't ask for.
  const shownPitches = useMemo(() => {
    if (pinned.length > 0) {
      const out: { hand: 'R' | 'L'; pitchType: string; row: any }[] = []
      for (const p of pinned) {
        const row = activeRows[p.hand].find(r => r.pitch_type === p.pitchType)
        if (row) out.push({ hand: p.hand, pitchType: p.pitchType, row })
      }
      return out
    }
    if (showAll) {
      const out: { hand: 'R' | 'L'; pitchType: string; row: any }[] = []
      for (const hand of ['R', 'L'] as const) for (const row of activeRows[hand]) out.push({ hand, pitchType: row.pitch_type, row })
      return out
    }
    return hotPitches
  }, [hotPitches, pinned, activeRows, showAll])

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-5 sm:px-6">
      <div className="fade-in" style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', margin: 0 }}>
          Pitcher <span style={{ color: 'var(--accent)' }}>Report</span>
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
          Pick today's starter, see his pitch mix and who he's been getting hit by lately, then see which of tonight's opposing batters are hot against those exact pitches.
        </p>
      </div>

      <DateStrip date={date} onChange={setDate} />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>
      ) : starters.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No probable starters announced yet for {date}.</div>
      ) : (
        <>
          {/* starter picker */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {starters.map(s => {
              const isSel = s.key === selectedKey
              return (
                // A <div role="button"> instead of a real <button> — the
                // avatar below needs to be its own nested <Link> to the
                // player profile (clicking anywhere else here still selects
                // this starter same as before), and a real <a> nested inside
                // a real <button> is invalid HTML.
                <div
                  key={s.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedKey(s.key)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedKey(s.key) } }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 12px', borderRadius: 10,
                    border: `1px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
                    background: isSel ? 'var(--accent-dim)' : 'var(--surface)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Link href={`/players/${s.pitcher.id}`} onClick={e => e.stopPropagation()} style={{ display: 'flex', flexShrink: 0 }}>
                    <PlayerAvatar headshot={mlbHeadshot(s.pitcher.id)} teamLogo={getTeamLogoUrl(s.teamAbbr)} teamAbbr={s.teamAbbr} name={s.pitcher.name} size={32} />
                  </Link>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isSel ? 'var(--accent)' : 'var(--text-1)' }}>{s.pitcher.name}</div>
                    <div style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {/* Same L/R color convention as the batter-hand badges
                          in these tables (L=blue, R=orange) — so pitcher
                          handedness reads at a glance instead of blending
                          into gray meta text. */}
                      <span style={{ fontWeight: 800, color: s.pitcher.hand === 'L' ? '#60a5fa' : '#fb923c' }}>{s.pitcher.hand}HP</span>
                      <span style={{ color: 'var(--text-3)' }}>·</span>
                      <TeamLogoImg abbr={s.teamAbbr} size={12} />
                      <span style={{ color: 'var(--text-3)' }}>vs</span>
                      <TeamLogoImg abbr={s.oppAbbr} size={12} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {selected && (
            <>
              {/* selected pitcher header — links to his player profile, plain hover-underline since nothing else in this header competes for the click */}
              <Tooltip content={`Open ${selected.pitcher.name}'s player profile`}>
                <Link
                  href={`/players/${selected.pitcher.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, textDecoration: 'none', color: 'inherit', width: 'fit-content' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
                >
                  <PlayerAvatar headshot={mlbHeadshot(selected.pitcher.id)} teamLogo={getTeamLogoUrl(selected.teamAbbr)} teamAbbr={selected.teamAbbr} name={selected.pitcher.name} size={44} />
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)' }}>
                      {selected.pitcher.name} <span style={{ color: 'var(--accent)' }}>{selected.pitcher.hand}HP</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {selected.teamName} · facing {selected.oppName} · {selected.oppLineupConfirmed ? 'Confirmed lineup' : 'Projected lineup (roster, not confirmed batting order)'}
                    </div>
                  </div>
                </Link>
              </Tooltip>
              {/* window mode toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <button onClick={() => setWindowMode('14day')} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', background: windowMode === '14day' ? 'var(--accent)' : 'var(--surface)', color: windowMode === '14day' ? 'var(--accent-fg)' : 'var(--text-2)' }}>14-Day Window</button>
                  <button onClick={() => setWindowMode('live')} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', background: windowMode === 'live' ? 'var(--accent)' : 'var(--surface)', color: windowMode === 'live' ? 'var(--accent-fg)' : 'var(--text-2)' }}>Last N Starts/Games</button>
                </div>
                {windowMode === 'live' && (
                  <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {[3, 5, 10].map(n => (
                      <button key={n} onClick={() => setLiveN(n)} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, border: 'none', borderLeft: n !== 3 ? '1px solid var(--border)' : 'none', cursor: 'pointer', background: liveN === n ? 'var(--accent-dim)' : 'var(--surface)', color: liveN === n ? 'var(--accent)' : 'var(--text-2)' }}>N={n}</button>
                    ))}
                  </div>
                )}
                {windowMode === 'live' && liveLoading && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Computing from MLB play-by-play…</span>}
              </div>

              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 16 }}>
                {windowMode === 'live' && liveError ? (
                  <span style={{ color: '#f87171' }}>{liveError}</span>
                ) : allRows.length === 0 ? (
                  liveLoading ? 'Computing…' : 'No recent pitch-type data for this pitcher yet.'
                ) : windowMode === 'live' ? (
                  <>
                    {`Sample: ${winLabel} — real starts, computed live from MLB play-by-play (not a rolling calendar window)`}
                    {/* That date range is this pitcher's own — each opposing batter's
                        numbers further down aren't from at-bats against him specifically
                        (rare to have enough of those to be meaningful); they're each
                        hitter's own last N games vs same-handed pitching in general, i.e.
                        how he's hitting this pitch mix right now. Was flagged as a
                        possible mismatch and confirmed as the intended read — this just
                        makes it explicit instead of implying one shared date range. */}
                    <div style={{ marginTop: 2 }}>
                      Batter rows below use each hitter's own last {liveN} games vs same-handed pitching (any opponent) — his current form against this pitch, not at-bats vs this specific pitcher.
                    </div>
                  </>
                ) : (
                  `Sample: ${winLabel} · rolling window, not a start count`
                )}
              </div>

              {/* pitch mix */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
                <PitchMixTable title="VS RHB" rows={activeRows.R} hand="R" pinned={pinnedByHand.R} onTogglePin={onTogglePin} />
                <PitchMixTable title="VS LHB" rows={activeRows.L} hand="L" pinned={pinnedByHand.L} onTogglePin={onTogglePin} />
              </div>

              {/* getting-hit-on-lately cross reference — gated on there being
                  any pitch data at all, not on shownPitches specifically, so
                  the "Show all pitches" toggle stays reachable even when no
                  single pitch clears the auto top-2's 10-pitch threshold. */}
              {allRows.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-1)' }}>
                      {pinned.length > 0 ? '📌 Pinned pitches' : showAll ? 'Every pitch vs every batter' : 'Getting hit on these pitches lately'}
                    </div>
                    <button
                      onClick={() => setShowAll(v => !v)}
                      style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${showAll ? 'var(--accent)' : 'var(--border)'}`, background: showAll ? 'var(--accent)' : 'var(--surface)', color: showAll ? 'var(--accent-fg)' : 'var(--text-2)' }}
                    >
                      {showAll ? '✓ Showing all pitches' : 'Show all pitches'}
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 12 }}>
                    {pinned.length > 0
                      ? `Showing only what you've pinned (${pinned.length}) — unpin everything below to go back to ${showAll ? 'showing every pitch' : 'the auto-picked top 2 per hand'}.`
                      : showAll
                      ? 'Every pitch this pitcher has thrown vs each hand, matched against the opposing lineup\'s own recent numbers for that exact combo — no curation.'
                      : 'Auto-picked: ranked by barrel% + hard-hit% in the window above (min. 10 tracked pitches), top 2 per hand. Click any row in the tables above to pin it instead — pinning takes over this whole section until you unpin.'}
                  </div>
                  {shownPitches.length === 0 && (
                    <div style={{ padding: 12, color: 'var(--text-3)', fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12 }}>
                      No pitch cleared the 10-pitch auto-pick threshold and nothing's pinned yet — click "Show all pitches" above, or click any row in the tables above to pin it.
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {shownPitches.map(({ hand, pitchType, row }) => {
                      const batters = selected.oppLineup.filter(p => effectiveBatSide(p.bats, selected.pitcher.hand) === hand)
                      const isManual = pinnedByHand[hand].has(pitchType)
                      return (
                        <div
                          key={`${hand}-${pitchType}`}
                          className={isManual ? 'pinned-moving-border' : undefined}
                          style={isManual ? { padding: 12, borderRadius: 14, background: 'var(--surface)' } : undefined}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: pitchColor(pitchType) }} />
                            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>{pitchLabel(pitchType)} vs {hand}HB</span>
                            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                              ({pct(row.hard_hit_pct)} hard-hit · {pct(row.barrel_pct)} barrel · {row.pitches} pitches)
                            </span>
                            {isManual && (
                              <Tooltip content="Unpin">
                                <button
                                  onClick={() => onTogglePin(hand, pitchType)}
                                  style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-dim)', border: 'none', borderRadius: 99, padding: '2px 7px', cursor: 'pointer' }}
                                >
                                  📌 pinned ✕
                                </button>
                              </Tooltip>
                            )}
                          </div>
                          {batters.length === 0 ? (
                            <div style={{ padding: 12, color: 'var(--text-3)', fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                              No {hand}HB batters in {selected.oppLineupConfirmed ? 'the confirmed lineup' : 'the projected lineup'}.
                            </div>
                          ) : (
                            <BatterVsPitchTable
                              pitchType={pitchType}
                              batters={batters}
                              date={date}
                              pitcherId={selected.pitcher.id}
                              pitcherHand={selected.pitcher.hand}
                              splitMap={splitMap}
                              timingMap={timingMap}
                              pitcherMap={statcastPitcherMap}
                              pikkitMap={pikkitMap}
                              getRow={b => windowMode === 'live'
                                ? liveData?.batters[String(b.mlb_id)]?.[pitchType]?.[selected.pitcher.hand as 'R' | 'L'] ?? null
                                : batterPitchMap[b.name_norm]?.[pitchType]?.[selected.pitcher.hand] ?? null}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
