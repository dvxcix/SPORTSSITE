'use client'

import { useEffect, useMemo, useState } from 'react'
import { pitchColor, pitchLabel } from '@/lib/mlb-api'
import { heat, SortableTH, SortState, toggleSortState, cmpNullsLast } from '@/components/pitcher-report/MatchupTables'
import { cardStyle, sectionTitleStyle, windowTag, ToggleBtn, DimChip, StatGrid } from './PlayerPageClient'
import { PlayerPicker, type PickerOption } from './PlayerPicker'
import { ZoneScoreCard } from './ZoneScoreCard'
import { type BatterPitchRow, computeBatterStats, BATTER_STAT_COLS as TABLE_COLS, r3, d1, p1, i0 } from '@/lib/batterStatsEngine'

export type { BatterPitchRow }
const computeStats = computeBatterStats

const RECENCY_OPTIONS = [
  { key: 'season', label: 'Season' },
  { key: '30', label: 'Last 30 Games' },
  { key: '15', label: 'Last 15 Games' },
  { key: '7', label: 'Last 7 Games' },
] as const

const dateInputStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)',
}

function PitchTypeCell({ pitchType }: { pitchType: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: pitchColor(pitchType), flexShrink: 0 }} />
      {pitchLabel(pitchType)}
    </span>
  )
}

// Fully custom batter split builder — pick any combination of opponent
// pitcher, pitcher hand, day/night, a recency window or a custom date
// range, and the resulting per-pitch-type breakdown table recomputes live,
// entirely client-side over the season's raw pitch log (same "raw rows in,
// filter/aggregate in the browser" pattern the split explorers use).
export type TodayOpponentPitcher = { pitcherId: number; pitcherName: string; teamAbbr: string | null }

export function BatterMatchupExplorer({ rows, myName, todayOpponent }: { rows: BatterPitchRow[]; myName: string; todayOpponent?: TodayOpponentPitcher | null }) {
  const [recency, setRecency] = useState<typeof RECENCY_OPTIONS[number]['key']>('season')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [handSel, setHandSel] = useState<'all' | 'L' | 'R'>('all')
  const [dayNightSel, setDayNightSel] = useState<'all' | 'day' | 'night'>('all')
  const [inningSel, setInningSel] = useState<number | 'all'>('all')
  const [inPlayOnly, setInPlayOnly] = useState(false)
  const [opponentSel, setOpponentSel] = useState<number | 'all'>('all')
  const [autoAppliedToday, setAutoAppliedToday] = useState(false)
  const [sort, setSort] = useState<SortState>({ col: 'pitches', dir: 'desc' })

  const allGameDates = useMemo(() => Array.from(new Set(rows.map(r => r.game_date))).sort(), [rows])
  const opponents = useMemo(() => {
    const counts = new Map<number, PickerOption>()
    for (const r of rows) {
      const e = counts.get(r.opponent_id)
      if (e) e.count++
      else counts.set(r.opponent_id, { id: r.opponent_id, name: r.opponent_name, teamAbbr: r.opponent_team, count: 1 })
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count)
  }, [rows])

  // Defaults to today's real probable opposing pitcher the moment that
  // context loads (a separate, slightly-slower fetch than this card's own
  // pitch-log rows) — fires once; a manual pick from the dropdown afterward
  // is never overwritten since this only runs while autoAppliedToday is
  // still false.
  useEffect(() => {
    if (todayOpponent && !autoAppliedToday) {
      setOpponentSel(todayOpponent.pitcherId)
      setAutoAppliedToday(true)
    }
  }, [todayOpponent, autoAppliedToday])

  if (!rows.length) return null

  // A custom date range takes over from the recency presets the moment
  // either date is set — resolved against the player's real games-played
  // calendar, independent of the hand/day-night/opponent filters ("his
  // last 15 games, vs LHP" means his 15 most recent games, not the 15 most
  // recent matching every other filter too).
  const usingCustomRange = dateFrom !== '' || dateTo !== ''
  const recentDates = !usingCustomRange && recency !== 'season' ? new Set(allGameDates.slice(-Number(recency))) : null

  const innings = Array.from(new Set(rows.map(r => r.inning).filter((v): v is number => v != null))).sort((a, b) => a - b)

  const filtered = rows.filter(r =>
    (usingCustomRange ? (!dateFrom || r.game_date >= dateFrom) && (!dateTo || r.game_date <= dateTo) : true) &&
    (recentDates === null || recentDates.has(r.game_date)) &&
    (handSel === 'all' || r.p_throws === handSel) &&
    (dayNightSel === 'all' || r.day_night === dayNightSel) &&
    (inningSel === 'all' || r.inning === inningSel) &&
    (!inPlayOnly || r.is_in_play) &&
    (opponentSel === 'all' || r.opponent_id === opponentSel)
  )
  const all = computeStats(filtered)

  const pitchTypes = Array.from(new Set(filtered.map(r => r.pitch_type).filter((v): v is string => !!v)))
  const byPitch = pitchTypes.map(pt => ({ pitchType: pt, ...computeStats(filtered.filter(r => r.pitch_type === pt)) }))
  byPitch.forEach(row => { row.usage = all.pitches > 0 ? (row.pitches / all.pitches) * 100 : null })

  const onSort = (col: string) => setSort(prev => toggleSortState(prev, col))
  const activeSort = sort ?? { col: 'pitches', dir: 'desc' as const }
  const sortedByPitch = [...byPitch].sort((a, b) => {
    if (activeSort.col === 'pitchType') {
      const cmp = pitchLabel(a.pitchType).localeCompare(pitchLabel(b.pitchType))
      return activeSort.dir === 'desc' ? -cmp : cmp
    }
    return cmpNullsLast((a as any)[activeSort.col], (b as any)[activeSort.col], activeSort.dir)
  })
  const allByCol = Object.fromEntries(TABLE_COLS.map(c => [c.key, byPitch.map(r => r[c.key])]))
  const selectedOpponent = opponentSel === 'all' ? null : opponents.find(o => o.id === opponentSel) ?? null

  return (
    <>
    <div style={cardStyle}>
      <div style={sectionTitleStyle}>
        Matchup Explorer
        <span style={windowTag}>{all.pitches.toLocaleString()} pitches · {all.games} game{all.games === 1 ? '' : 's'}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        {RECENCY_OPTIONS.map(o => (
          <ToggleBtn key={o.key} active={!usingCustomRange && recency === o.key} onClick={() => { setRecency(o.key); setDateFrom(''); setDateTo('') }}>{o.label}</ToggleBtn>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>or custom range:</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dateInputStyle} />
        <span style={{ color: 'var(--text-3)', fontSize: 11 }}>–</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={dateInputStyle} />
        {usingCustomRange && <ToggleBtn active={false} onClick={() => { setDateFrom(''); setDateTo('') }}>Clear</ToggleBtn>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Pitcher hand:</span>
        <DimChip label="All" active={handSel === 'all'} onClick={() => setHandSel('all')} />
        <DimChip label="vs RHP" active={handSel === 'R'} onClick={() => setHandSel('R')} />
        <DimChip label="vs LHP" active={handSel === 'L'} onClick={() => setHandSel('L')} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Game:</span>
        <DimChip label="All" active={dayNightSel === 'all'} onClick={() => setDayNightSel('all')} />
        <DimChip label="Day" active={dayNightSel === 'day'} onClick={() => setDayNightSel('day')} />
        <DimChip label="Night" active={dayNightSel === 'night'} onClick={() => setDayNightSel('night')} />
        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>Vs. pitcher:</span>
        <PlayerPicker options={opponents} value={opponentSel} onChange={setOpponentSel} placeholder="All pitchers" />
        {todayOpponent && opponentSel === todayOpponent.pitcherId && (
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 6, padding: '2px 8px' }}>
            TODAY&apos;S MATCHUP
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Inning:</span>
        <DimChip label="All" active={inningSel === 'all'} onClick={() => setInningSel('all')} />
        {innings.map(inn => (
          <DimChip key={inn} label={String(inn)} active={inningSel === inn} onClick={() => setInningSel(inn)} />
        ))}
        <ToggleBtn active={inPlayOnly} onClick={() => setInPlayOnly(v => !v)}>In Play Only</ToggleBtn>
      </div>

      {all.pitches === 0 ? (
        <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No pitches match this combination of filters.</div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <StatGrid pairs={[
              ['PA', i0(all.pa)], ['AB', i0(all.ab)], ['H', i0(all.hits)], ['HR', i0(all.hr)],
              ['BB', i0(all.bb)], ['K', i0(all.k)], ['K %', p1(all.kPct)], ['BB/Game', d1(all.bbPerGame)],
            ]} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <SortableTH label="Pitch" colKey="pitchType" sort={sort} onSort={onSort} align="left" />
                  {TABLE_COLS.map(c => (
                    <SortableTH key={c.key} label={c.label} colKey={c.key} sort={sort} onSort={onSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Pinned "All Pitches" summary row — never sorted, never heat-colored (it's an aggregate, not a peer of the pitch-type rows below it) */}
                <tr style={{ borderBottom: '2px solid var(--border-2)', fontWeight: 800 }}>
                  <td style={{ padding: '6px 8px', color: 'var(--text-1)' }}>All Pitches</td>
                  {TABLE_COLS.map(c => (
                    <td key={c.key} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)' }}>
                      {c.key === 'usage' ? '100.0%' : c.fmt(all[c.key])}
                    </td>
                  ))}
                </tr>
                {sortedByPitch.map(row => (
                  <tr key={row.pitchType} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 700 }}><PitchTypeCell pitchType={row.pitchType} /></td>
                    {TABLE_COLS.map(c => {
                      const v = row[c.key]
                      return (
                        <td key={c.key} style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...(c.noHeat ? {} : heat(v as number | null, allByCol[c.key], c.dir)) }}>
                          {c.fmt(v)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {sortedByPitch.length === 0 && (
                  <tr><td colSpan={TABLE_COLS.length + 1} style={{ padding: '12px 8px', color: 'var(--text-3)', textAlign: 'center' }}>No pitch-type breakdown for this window.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
    {selectedOpponent && (
      <ZoneScoreCard pageRole="batter" myName={myName} myRows={rows} opponentId={selectedOpponent.id} opponentName={selectedOpponent.name} />
    )}
    </>
  )
}
