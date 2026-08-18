'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check, ChevronDown, X } from 'lucide-react'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { mlbHeadshot, pitchColor, pitchLabel } from '@slipsurge/core/mlb-api'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { Tooltip } from '@/components/ui/tooltip-card'
import { PitchMixTable, BatterVsPitchTable, TeamLogoImg, effectiveBatSide, pct } from './MatchupTables'
import { normName } from '@slipsurge/core/nameNorm'
import { DateButtonNavigator } from '@/components/product/DateButtonNavigator'
import { PageState } from '@/components/layout/PageState'

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
  date: string; games: Game[]
  statSplits: any[]; timingSplits: any[]; pitcherSplits: any[]; communityPicks: any[]
}

interface StarterOption {
  key: string
  gameKey: string
  gamePk: number
  gameDate: string
  pitcher: PitcherInfo
  teamAbbr: string; teamName: string
  oppAbbr: string; oppName: string
  oppLineup: LineupPlayer[]
  oppLineupConfirmed: boolean
}

function StarterOptionCard({ starter, selected, onSelect }: { starter: StarterOption; selected: boolean; onSelect: () => void }) {
  return (
    <div
      className={`pitcher-starter-option${selected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      <Link href={`/players/${starter.pitcher.id}`} onClick={event => event.stopPropagation()} className="pitcher-starter-avatar">
        <PlayerAvatar headshot={mlbHeadshot(starter.pitcher.id)} teamLogo={getTeamLogoUrl(starter.teamAbbr)} teamAbbr={starter.teamAbbr} name={starter.pitcher.name} size={34} />
      </Link>
      <div className="pitcher-starter-copy">
        <strong>{starter.pitcher.name}</strong>
        <span>
          <b className={starter.pitcher.hand === 'L' ? 'is-left' : 'is-right'}>{starter.pitcher.hand}HP</b>
          <TeamLogoImg abbr={starter.teamAbbr} size={13} />
          <small>vs</small>
          <TeamLogoImg abbr={starter.oppAbbr} size={13} />
        </span>
      </div>
      {selected ? <Check className="pitcher-starter-check" size={15} /> : null}
    </div>
  )
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
type PitcherReportClientProps = {
  date?: string
  gameKey?: string | null
  embedded?: boolean
}

export function PitcherReportClient({ date: controlledDate, gameKey, embedded = false }: PitcherReportClientProps = {}) {
  // Deep-link support (Dugout's opposing-pitcher chip links here with both
  // params) — date picks the right slate, pitcherId auto-selects that exact
  // starter once his game's data loads instead of defaulting to whoever's
  // first in the list.
  const searchParams = useSearchParams()
  const linkedPitcherId = searchParams.get('pitcherId')
  const [internalDate, setInternalDate] = useState<string>(() => searchParams.get('date') || localToday())
  const date = controlledDate ?? internalDate
  const [data, setData] = useState<DugoutData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [starterPickerOpen, setStarterPickerOpen] = useState(false)

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
      if (gameKey && g.gameKey !== gameKey) continue
      if (g.awayPitcher) {
        out.push({
          key: `${g.gameKey}-away`, gameKey: g.gameKey, gamePk: g.gamePk, gameDate: g.gameDate, pitcher: g.awayPitcher,
          teamAbbr: g.awayAbbr, teamName: g.awayTeam,
          oppAbbr: g.homeAbbr, oppName: g.homeTeam,
          oppLineup: g.homeLineup, oppLineupConfirmed: g.homeLineupConfirmed,
        })
      }
      if (g.homePitcher) {
        out.push({
          key: `${g.gameKey}-home`, gameKey: g.gameKey, gamePk: g.gamePk, gameDate: g.gameDate, pitcher: g.homePitcher,
          teamAbbr: g.homeAbbr, teamName: g.homeTeam,
          oppAbbr: g.awayAbbr, oppName: g.awayTeam,
          oppLineup: g.awayLineup, oppLineupConfirmed: g.awayLineupConfirmed,
        })
      }
    }
    return out
  }, [data, gameKey])

  useEffect(() => {
    if (selectedKey && starters.some(starter => starter.key === selectedKey)) return
    if (!starters.length) { setSelectedKey(null); return }
    const linked = linkedPitcherId ? starters.find(s => String(s.pitcher.id) === linkedPitcherId) : null
    setSelectedKey((linked ?? starters[0]).key)
  }, [starters, selectedKey, linkedPitcherId])

  const selected = starters.find(s => s.key === selectedKey) ?? null

  useEffect(() => {
    if (!starterPickerOpen) return
    const mobileQuery = window.matchMedia('(max-width: 640px)')
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStarterPickerOpen(false)
    }
    let locked = false
    const syncScrollLock = () => {
      if (mobileQuery.matches && !locked) {
        document.body.style.overflow = 'hidden'
        locked = true
      } else if (!mobileQuery.matches && locked) {
        document.body.style.overflow = previousOverflow
        locked = false
      }
    }

    syncScrollLock()
    mobileQuery.addEventListener('change', syncScrollLock)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      mobileQuery.removeEventListener('change', syncScrollLock)
      if (locked) document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [starterPickerOpen])

  const splitMap = useMemo(() => buildSplitMap(data?.statSplits ?? []), [data?.statSplits])
  const timingMap = useMemo(() => buildTimingMap(data?.timingSplits ?? []), [data?.timingSplits])
  const statcastPitcherMap = useMemo(() => buildPitcherMap(data?.pitcherSplits ?? []), [data?.pitcherSplits])
  // Keep the home_runs row specifically — this table only ever displays an
  // "Anytime HR picks" count, so a player with picks in some OTHER market
  // (hrr, singles, tb...) but no home_runs row must show nothing here, not
  // that other market's count mislabeled as HR (same fix as Dugout's map).
  //
  // Also scoped to the selected starter's own gameKey — a doubleheader's
  // two legs share every batter between them, and pikkit rows now carry a
  // real per-leg game_key. A row explicitly tagged for THIS game always
  // wins over a legacy/untagged ('') row for the same player, regardless
  // of array order — otherwise a pre-fix import for the OTHER leg can
  // still win the overwrite and bleed onto this one.
  const communityPicksMap = useMemo(() => {
    const gameKey = selected?.gameKey ?? null
    const m: Record<string, any> = {}
    for (const r of (data?.communityPicks ?? [])) {
      if (r.game_key && gameKey && r.game_key !== gameKey) continue
      const nn = normName(r.player_name || '')
      const market = r.prop_type || r.market
      if (!nn || market !== 'home_runs') continue
      const existing = m[nn]
      if (!existing || (r.game_key && r.game_key === gameKey && !existing.game_key)) {
        m[nn] = r
      }
    }
    return m
  }, [data?.communityPicks, selected?.gameKey])

  // "Last N starts" / "last N games" window — computed live from MLB's free
  // Gumbo feed (src/lib/pitchLog.ts) for every request, so it's only ever as
  // stale as MLB's own play-by-play feed (i.e. never, beyond the game itself
  // finishing). This used to be one of two modes, toggled against a
  // pre-aggregated "14-Day Window" read from mlb-party's
  // batter_pitch_type_recent/pitcher_pitch_type_recent tables — those tables
  // stopped updating (frozen since early July) and the fields that fed them
  // (`pitcherPitchRecent`/`batterPitchRecent`) were removed from
  // /api/dugout/data's response entirely on 2026-07-24 when Paper's
  // matchup_edge/platoon_ops moved to an in-house precompute, but this page
  // was never updated to match — so "14-Day Window" silently showed nothing
  // for every pitcher from that day forward (confirmed via a customer
  // report). Rather than reconnect a data source the org already moved off
  // of sitewide in favor of games-played windows, this is now the only mode.
  const [liveN, setLiveN] = useState(3)
  const [liveData, setLiveData] = useState<{ window: { games: number; dateFrom: string | null; dateTo: string | null }; pitcherRows: { R: any[]; L: any[] }; batters: Record<string, Record<string, { R?: any; L?: any }>> } | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState('')

  useEffect(() => {
    if (!selected) { setLiveData(null); return }
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
  }, [liveN, selected, date])

  const activeRows = liveData ? { R: liveData.pitcherRows.R, L: liveData.pitcherRows.L } : { R: [] as any[], L: [] as any[] }

  const allRows = [...activeRows.R, ...activeRows.L]
  const winLabel = liveData ? `Last ${liveData.window.games} starts (${liveData.window.dateFrom} – ${liveData.window.dateTo})` : ''

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
  useEffect(() => { setPinned([]) }, [selected?.key, liveN])
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
  useEffect(() => { setShowAll(false) }, [selected?.key, liveN])
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
    <div>
      {!embedded && <DateButtonNavigator date={date} today={localToday()} onChange={setInternalDate} />}

      {loading ? (
        <PageState compact kind="loading" title="Loading probable starters" message="Preparing pitch mixes and opponent lineups." />
      ) : starters.length === 0 ? (
        <PageState compact kind="empty" title="No probable starters yet" message={`No probable starters are available for ${date}.`} />
      ) : (
        <>
          <div className="pitcher-starter-grid">
            {starters.map(starter => (
              <StarterOptionCard key={starter.key} starter={starter} selected={starter.key === selectedKey} onSelect={() => setSelectedKey(starter.key)} />
            ))}
          </div>

          {selected ? (
            <button type="button" className="pitcher-starter-mobile-trigger" onClick={() => setStarterPickerOpen(true)} aria-haspopup="dialog">
              <PlayerAvatar headshot={mlbHeadshot(selected.pitcher.id)} teamLogo={getTeamLogoUrl(selected.teamAbbr)} teamAbbr={selected.teamAbbr} name={selected.pitcher.name} size={38} />
              <span>
                <small>Selected starter</small>
                <strong>{selected.pitcher.name}</strong>
                <em>{selected.pitcher.hand}HP · {selected.teamAbbr} vs {selected.oppAbbr}</em>
              </span>
              <b>Change <ChevronDown size={14} /></b>
            </button>
          ) : null}

          {selected && (
            <>
              {/* selected pitcher header — links to his player profile, plain hover-underline since nothing else in this header competes for the click */}
              <Tooltip content={`Open ${selected.pitcher.name}'s player profile`}>
                <Link
                  className="pitcher-selected-header"
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
              {/* recency window — N starts/games, computed live from MLB play-by-play */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {[3, 5, 10].map(n => (
                    <button key={n} onClick={() => setLiveN(n)} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, border: 'none', borderLeft: n !== 3 ? '1px solid var(--border)' : 'none', cursor: 'pointer', background: liveN === n ? 'var(--accent-dim)' : 'var(--surface)', color: liveN === n ? 'var(--accent)' : 'var(--text-2)' }}>Last {n} Starts</button>
                  ))}
                </div>
                {liveLoading && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Computing from MLB play-by-play…</span>}
              </div>

              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 16 }}>
                {liveError ? (
                  <span style={{ color: '#f87171' }}>{liveError}</span>
                ) : allRows.length === 0 ? (
                  liveLoading ? 'Computing…' : 'No recent pitch-type data for this pitcher yet.'
                ) : (
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
                              communityPicksMap={communityPicksMap}
                              gameInfo={{ sport: 'MLB', game_pk: String(selected.gamePk), game_date: date }}
                              getRow={b => liveData?.batters[String(b.mlb_id)]?.[pitchType]?.[selected.pitcher.hand as 'R' | 'L'] ?? null}
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
      {starterPickerOpen ? (
        <div className="pitcher-picker-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setStarterPickerOpen(false)
        }}>
          <section className="pitcher-picker-sheet" role="dialog" aria-modal="true" aria-label="Choose a probable starter">
            <header>
              <div>
                <span>Probable starters</span>
                <strong>Choose a matchup</strong>
              </div>
              <button type="button" onClick={() => setStarterPickerOpen(false)} aria-label="Close starter picker"><X size={17} /></button>
            </header>
            <div className="pitcher-picker-list">
              {starters.map(starter => (
                <StarterOptionCard
                  key={starter.key}
                  starter={starter}
                  selected={starter.key === selectedKey}
                  onSelect={() => {
                    setSelectedKey(starter.key)
                    setStarterPickerOpen(false)
                  }}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}
      <style>{`
        .pitcher-starter-grid{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
        .pitcher-starter-option{display:flex;min-width:190px;align-items:center;gap:8px;padding:7px 11px;border:1px solid var(--border);border-radius:10px;background:var(--surface);cursor:pointer;text-align:left;transition:border-color 150ms ease,background 150ms ease,transform 150ms ease}
        .pitcher-starter-option:hover{border-color:color-mix(in srgb,var(--accent) 42%,var(--border));transform:translateY(-1px)}
        .pitcher-starter-option.is-selected{border-color:var(--accent);background:var(--accent-dim)}
        .pitcher-starter-option:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
        .pitcher-starter-avatar{display:flex;flex:0 0 auto}
        .pitcher-starter-copy{display:grid;gap:3px;min-width:0;flex:1}
        .pitcher-starter-copy>strong{overflow:hidden;color:var(--text-1);font-size:12px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}
        .pitcher-starter-option.is-selected .pitcher-starter-copy>strong{color:var(--accent)}
        .pitcher-starter-copy>span{display:flex;align-items:center;gap:4px;color:var(--text-3);font-size:9px}
        .pitcher-starter-copy b{font-size:9px}.pitcher-starter-copy b.is-left{color:#60a5fa}.pitcher-starter-copy b.is-right{color:#fb923c}
        .pitcher-starter-copy small{font-size:9px}
        .pitcher-starter-check{flex:0 0 auto;color:var(--accent)}
        .pitcher-starter-mobile-trigger,.pitcher-picker-backdrop{display:none}
        @media(max-width:640px){
          .pitcher-starter-grid{display:none}
          .pitcher-starter-mobile-trigger{display:flex;width:100%;min-height:64px;align-items:center;gap:10px;margin-bottom:12px;padding:9px 10px;border:1px solid color-mix(in srgb,var(--accent) 34%,var(--border));border-radius:13px;background:linear-gradient(135deg,var(--accent-dim),var(--surface));color:var(--text-1);text-align:left}
          .pitcher-starter-mobile-trigger>span{display:grid;gap:1px;min-width:0;flex:1;font-style:normal}
          .pitcher-starter-mobile-trigger small{color:var(--accent);font-family:var(--font-mono,monospace);font-size:8px;font-weight:850;letter-spacing:.07em;text-transform:uppercase}
          .pitcher-starter-mobile-trigger strong{overflow:hidden;font-size:13px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}
          .pitcher-starter-mobile-trigger em{color:var(--text-3);font-size:9px;font-style:normal;font-weight:700}
          .pitcher-starter-mobile-trigger>b{display:flex;align-items:center;gap:3px;color:var(--accent);font-size:9px;font-weight:850}
          .pitcher-selected-header{display:none!important}
          .pitcher-picker-backdrop{position:fixed;inset:0;z-index:1500;display:flex;align-items:flex-end;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);overscroll-behavior:contain}
          .pitcher-picker-sheet{position:relative;display:flex;width:100%;max-height:calc(100dvh - 58px);flex-direction:column;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 30%,var(--border));border-bottom:0;border-radius:20px 20px 0 0;background:var(--surface);box-shadow:0 -20px 70px rgba(0,0,0,.65);padding-bottom:max(10px,env(safe-area-inset-bottom));animation:pitcher-picker-in 180ms ease-out}
          .pitcher-picker-sheet::before{content:"";position:absolute;top:7px;left:50%;width:38px;height:4px;border-radius:99px;background:var(--text-4);transform:translateX(-50%);opacity:.7}
          .pitcher-picker-sheet>header{display:flex;align-items:center;gap:10px;padding:20px 14px 12px;border-bottom:1px solid var(--border)}
          .pitcher-picker-sheet>header>div{display:grid;gap:2px;min-width:0;flex:1}
          .pitcher-picker-sheet>header span{color:var(--accent);font-family:var(--font-mono,monospace);font-size:9px;font-weight:850;letter-spacing:.09em;text-transform:uppercase}
          .pitcher-picker-sheet>header strong{color:var(--text-1);font-size:15px}
          .pitcher-picker-sheet>header button{display:grid;width:36px;height:36px;place-items:center;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);color:var(--text-2)}
          .pitcher-picker-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-height:0;overflow-y:auto;padding:12px 14px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
          .pitcher-picker-list .pitcher-starter-option{min-width:0;padding:9px;background:var(--surface-2)}
          @keyframes pitcher-picker-in{from{opacity:.5;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        }
        @media(max-width:390px){.pitcher-picker-list{grid-template-columns:1fr}}
        @media(prefers-reduced-motion:reduce){.pitcher-picker-sheet{animation:none}}
      `}</style>
    </div>
  )
}
