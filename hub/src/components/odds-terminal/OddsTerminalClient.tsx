'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Activity, AlertCircle, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Crosshair, HelpCircle, Layers3, Pin, RefreshCw, RotateCcw, Search, SlidersHorizontal, Sparkles, UserRound, UsersRound, X, ZoomIn, ZoomOut } from 'lucide-react'
import { getTeamColor, getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { BookLogo } from '@/components/BookLogo'
import styles from './odds-terminal.module.css'

type PriceMap = Record<string, number>
type PropEntry = { name: string; [market: string]: string | PriceMap | undefined }
type Snapshot = { captured_at: string; prop_map: Record<string, PropEntry> }
type LineupPlayer = { mlb_id: number; name: string; name_norm: string; team: string; position?: string; batting_order?: number }
type Pitcher = { id: number; name: string; hand: string }
type Game = {
  gamePk: number; gameKey: string; gameDate: string; status: string; detailedStatus: string
  homeAbbr: string; awayAbbr: string; homePitcher?: Pitcher; awayPitcher?: Pitcher
  homeLineupConfirmed?: boolean; awayLineupConfirmed?: boolean
  homeLineup: LineupPlayer[]; awayLineup: LineupPlayer[]
}

const MARKETS = [
  ['fhr', 'First HR', 'Home Runs'], ['sa', 'Anytime HR', 'Home Runs'], ['hr2', '2+ HR', 'Home Runs'], ['hr3', '3+ HR', 'Home Runs'],
  ['hits', '1+ Hit', 'Hits'], ['hits2', '2+ Hits', 'Hits'], ['hits3', '3+ Hits', 'Hits'], ['singles', '1+ Single', 'Hits'], ['singles2', '2+ Singles', 'Hits'], ['doubles', '1+ Double', 'Hits'], ['triples', '1+ Triple', 'Hits'],
  ['rbi', '1+ RBI', 'Production'], ['rbi2', '2+ RBI', 'Production'], ['rbi3', '3+ RBI', 'Production'], ['runs', 'Run', 'Production'], ['runs2', '2+ Runs', 'Production'], ['hrr', 'H+R+RBI', 'Production'],
  ['tb', '2+ Bases', 'Total Bases'], ['tb3', '3+ Bases', 'Total Bases'], ['tb4', '4+ Bases', 'Total Bases'], ['tb5', '5+ Bases', 'Total Bases'],
  ['stolen_bases', '1+ Stolen Base', 'Other'], ['stolen_bases2', '2+ Stolen Bases', 'Other'], ['strikeouts', '1+ Batter K', 'Other'], ['strikeouts2', '2+ Batter Ks', 'Other'], ['strikeouts3', '3+ Batter Ks', 'Other'],
] as const
const BOOKS = [['fanduel', 'FanDuel'], ['draftkings', 'DraftKings'], ['caesars', 'Caesars'], ['fanatics', 'Fanatics'], ['betmgm', 'BetMGM'], ['betrivers', 'BetRivers']] as const
type BookKey = typeof BOOKS[number][0]
const BOOK_COLORS: Record<BookKey, string> = {
  fanduel: '#1493ff', draftkings: '#53d337', caesars: '#0b6b50',
  fanatics: '#f04444', betmgm: '#b88a45', betrivers: '#ffd43b',
}
const COLORS = ['#6ee7ff', '#ff7a90', '#f9d66d', '#a78bfa', '#67e8a5', '#fb923c', '#60a5fa', '#f472b6', '#c4f06c', '#22d3ee', '#e879f9', '#facc15', '#34d399', '#818cf8', '#fb7185', '#2dd4bf', '#f97316', '#a3e635']

function offsetDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}
function americanToProbability(odds: number) {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100)
}
function oddsLabel(value: number | null) {
  return value == null ? 'N/A' : `${value > 0 ? '+' : ''}${Math.round(value)}`
}
function norm(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}
function numericPrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

type SeriesPoint = { time: number; odds: number; value: number }
type Series = { id: string; playerId: number; name: string; team: string; book: BookKey; bookLabel: string; color: string; points: SeriesPoint[]; open: number; current: number; move: number }
type ViewPreset = { id: string; name: string; market: string; books: BookKey[]; mode: 'odds' | 'probability' | 'delta'; windowHours: number | null; lineView: 'all' | 'movers' }

const TIME_WINDOWS = [null, 12, 6, 2, 1] as const

function MovementChart({ series, mode, windowHours, activeLineId, pinnedLineIds, onLineClick }: { series: Series[]; mode: 'odds' | 'probability' | 'delta'; windowHours: number | null; activeLineId: string | null; pinnedLineIds: Set<string>; onLineClick: (id: string) => void }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number; time: number; clientX: number; clientY: number } | null>(null)
  const width = 1120, height = 480, left = 68, right = 26, top = 26, bottom = 52
  const allPoints = series.flatMap(s => s.points)
  if (!series.length || !allPoints.length) return <div className={styles.emptyChart}><Activity size={28} /><strong>No lines to display</strong><span>Select a player, sportsbook, and available market.</span></div>
  const latest = Math.max(...allPoints.map(p => p.time))
  const cutoff = windowHours == null ? Math.min(...allPoints.map(p => p.time)) : latest - windowHours * 60 * 60 * 1000
  const visibleSeries = series.map(s => {
    const inWindow = s.points.filter(point => point.time >= cutoff)
    const beforeWindow = s.points.findLast(point => point.time < cutoff)
    if (inWindow.length) return { ...s, points: beforeWindow ? [{ ...beforeWindow, time: cutoff }, ...inWindow] : inWindow }
    const last = s.points.at(-1)
    return last ? { ...s, points: [{ ...last, time: cutoff }, { ...last, time: latest }] } : s
  })
  const all = visibleSeries.flatMap(s => s.points)
  const xMin = cutoff, xMaxRaw = latest
  const xMax = xMaxRaw === xMin ? xMin + 1 : xMaxRaw
  const values = all.map(p => mode === 'odds' ? p.odds : mode === 'probability' ? americanToProbability(p.odds) * 100 : p.value)
  let yMin = Math.min(...values), yMax = Math.max(...values)
  if (yMax === yMin) { yMin -= 1; yMax += 1 }
  const pad = Math.max((yMax - yMin) * .12, mode === 'odds' ? 20 : .4)
  yMin -= pad; yMax += pad
  const x = (v: number) => left + ((v - xMin) / (xMax - xMin)) * (width - left - right)
  const y = (v: number) => top + (1 - (v - yMin) / (yMax - yMin)) * (height - top - bottom)
  const valueOf = (p: SeriesPoint) => mode === 'odds' ? p.odds : mode === 'probability' ? americanToProbability(p.odds) * 100 : p.value
  const ticks = Array.from({ length: 6 }, (_, i) => yMin + ((yMax - yMin) * i) / 5)
  const timeTicks = Array.from({ length: 6 }, (_, i) => xMin + ((xMax - xMin) * i) / 5)
  const cursorEntries = cursor ? visibleSeries.map(s => {
    const pointIndex = s.points.reduce((best, p, index) => Math.abs(p.time - cursor.time) < Math.abs(s.points[best].time - cursor.time) ? index : best, 0)
    const point = s.points[pointIndex]
    return { ...s, point, previous: pointIndex > 0 ? s.points[pointIndex - 1] : null, distance: Math.abs(y(valueOf(point)) - cursor.y) }
  }).sort((a, b) => a.distance - b.distance) : []
  const focusedId = cursorEntries[0]?.id

  return <div ref={shellRef} className={styles.chartShell} onMouseLeave={() => setCursor(null)} onMouseMove={event => {
    const box = shellRef.current?.getBoundingClientRect(); if (!box) return
    const px = Math.max(left, Math.min(width - right, ((event.clientX - box.left) / box.width) * width))
    const py = Math.max(top, Math.min(height - bottom, ((event.clientY - box.top) / box.height) * height))
    setCursor({ x: px, y: py, clientX: event.clientX, clientY: event.clientY, time: xMin + ((px - left) / (width - left - right)) * (xMax - xMin) })
  }}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Interactive odds movement chart">
      <defs><linearGradient id="terminal-grid-fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#75e7ff" stopOpacity=".08"/><stop offset=".5" stopColor="#75e7ff" stopOpacity=".22"/><stop offset="1" stopColor="#75e7ff" stopOpacity=".08"/></linearGradient></defs>
      {ticks.map(tick => <g key={tick}><line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)} stroke="url(#terminal-grid-fade)" strokeWidth="1"/><text x={left-12} y={y(tick)+4} textAnchor="end" className={styles.axisText}>{mode === 'odds' ? oddsLabel(tick) : `${tick.toFixed(1)}${mode === 'probability' ? '%' : ''}`}</text></g>)}
      {timeTicks.map(tick => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={top} y2={height-bottom} stroke="rgba(255,255,255,.045)"/><text x={x(tick)} y={height-20} textAnchor="middle" className={styles.axisText}>{new Date(tick).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</text></g>)}
      {mode === 'delta' && yMin < 0 && yMax > 0 && <line x1={left} x2={width-right} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.32)" strokeDasharray="5 6"/>}
      {visibleSeries.map(s => { const selectedLine = activeLineId === s.id; const pinned = pinnedLineIds.has(s.id); const hasFocus = Boolean(activeLineId || pinnedLineIds.size); const hovered = focusedId === s.id; const opacity = hasFocus ? (selectedLine || pinned ? .98 : .12) : cursor && !hovered ? .22 : .95; return <g key={s.id} role="button" tabIndex={0} aria-label={`Focus ${s.name}, ${s.bookLabel}`} opacity={opacity} onClick={()=>onLineClick(s.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onLineClick(s.id)}}} style={{cursor:'pointer'}}><polyline points={s.points.map(p => `${x(p.time)},${y(valueOf(p))}`).join(' ')} fill="none" stroke="transparent" strokeWidth="14" strokeLinejoin="round" strokeLinecap="round"/><polyline points={s.points.map(p => `${x(p.time)},${y(valueOf(p))}`).join(' ')} fill="none" stroke={s.color} strokeWidth={selectedLine || pinned || hovered ? 4.5 : 2.6} strokeLinejoin="round" strokeLinecap="round"/><circle cx={x(s.points.at(-1)!.time)} cy={y(valueOf(s.points.at(-1)!))} r={selectedLine || pinned || hovered ? 5.5 : 4} fill={s.color} stroke="#071016" strokeWidth="2"/></g> })}
      {cursor && <line x1={cursor.x} x2={cursor.x} y1={top} y2={height-bottom} stroke="#dffaff" strokeOpacity=".7" strokeDasharray="3 4"/>}
      {cursorEntries.slice(0, 4).map(s => <circle key={`cursor-${s.id}`} cx={x(s.point.time)} cy={y(valueOf(s.point))} r={s.id === focusedId ? 6 : 4} fill={s.color} stroke="#071016" strokeWidth="2.5"/>)}
    </svg>
    {cursor && typeof document !== 'undefined' && createPortal(<div className={styles.chartTooltip} data-side={cursor.clientX > window.innerWidth * .62 ? 'left' : 'right'} style={{ left: cursor.clientX, top: Math.max(76, Math.min(window.innerHeight - 300, cursor.clientY)) }}>
      <header><span>CAPTURE INSPECTOR</span><time>{new Date(cursorEntries[0]?.point.time ?? cursor.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</time></header>
      {cursorEntries.slice(0, 4).map((s, index) => { const step=s.previous?s.point.odds-s.previous.odds:0;const fromOpen=s.point.odds-s.open;return <div className={styles.inspectCard} data-focus={index===0} key={s.id} style={{'--signal':s.color} as CSSProperties}>
        <span className={styles.inspectAvatar}><img src={mlbHeadshot(s.playerId)} alt=""/><img src={getTeamLogoUrl(s.team)} alt=""/></span>
        <span className={styles.inspectIdentity}><strong>{s.name}</strong><small className={styles.inspectBook}><BookLogo vendor={s.book} size={11}/>{s.bookLabel} · {new Date(s.point.time).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></span>
        <span className={styles.inspectPrice}><strong>{oddsLabel(s.point.odds)}</strong><small>{(americanToProbability(s.point.odds)*100).toFixed(1)}% implied</small></span>
        <span className={styles.inspectMove}><small>LAST MOVE</small><b data-direction={step<0?'shorter':step>0?'longer':'flat'}>{step>0?'+':''}{Math.round(step)}</b></span>
        <span className={styles.inspectMove}><small>FROM OPEN</small><b data-direction={fromOpen<0?'shorter':fromOpen>0?'longer':'flat'}>{fromOpen>0?'+':''}{Math.round(fromOpen)}</b></span>
      </div>})}
      {cursorEntries.length > 4 && <footer>4 nearest lines | {cursorEntries.length-4} more active</footer>}
    </div>, document.body)}
  </div>
}

export function OddsTerminalClient({ initialDate }: { initialDate: string }) {
  const router = useRouter()
  const [date, setDate] = useState(initialDate)
  const [games, setGames] = useState<Game[]>([])
  const [gamePk, setGamePk] = useState<number | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [captureCount, setCaptureCount] = useState(0)
  const [firstPitchAt, setFirstPitchAt] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [market, setMarket] = useState('fhr')
  const [selectedBooks, setSelectedBooks] = useState<Set<BookKey>>(() => new Set(BOOKS.map(([key]) => key)))
  const [mode, setMode] = useState<'odds' | 'probability' | 'delta'>('odds')
  const [windowHours, setWindowHours] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [marketQuery, setMarketQuery] = useState('')
  const [marketOpen, setMarketOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [scope, setScope] = useState<'game' | 'player'>('game')
  const [lineView, setLineView] = useState<'all' | 'movers'>('movers')
  const [showGuide, setShowGuide] = useState(false)
  const [presets, setPresets] = useState<ViewPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [activeLineId, setActiveLineId] = useState<string | null>(null)
  const [pinnedLineIds, setPinnedLineIds] = useState<Set<string>>(new Set())
  const [moveSort, setMoveSort] = useState<'move' | 'current' | 'player' | 'book'>('move')
  const [preferencesReady, setPreferencesReady] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setGames([]); setGamePk(null); setSnapshots([]); setCaptureCount(0); setFirstPitchAt(null)
    fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Could not load the slate.')
      return response.json()
    }).then(data => { if (!cancelled) { const next = data.games ?? []; setGames(next); setGamePk(next[0]?.gamePk ?? null) } }).catch(e => !cancelled && setError(e.message)).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [date, reloadKey])

  useEffect(() => {
    const selectedGame = games.find(candidate => candidate.gamePk === gamePk)
    if (!gamePk || !selectedGame) return
    let cancelled = false
    setHistoryLoading(true); setSnapshots([]); setCaptureCount(0); setFirstPitchAt(null); setError(null)
    const resolvedGameKey = selectedGame.gameKey || `${selectedGame.awayAbbr}@${selectedGame.homeAbbr}`
    fetch(`/api/odds-terminal?date=${date}&gamePk=${gamePk}&gameKey=${encodeURIComponent(resolvedGameKey)}`).then(async response => {
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Could not load movement history.')
      return response.json()
    }).then(data => { if (!cancelled) { setSnapshots(data.snapshots ?? []); setCaptureCount(data.sourceCount ?? data.snapshots?.length ?? 0); setFirstPitchAt(data.firstPitchAt ?? null) } }).catch(e => !cancelled && setError(e.message)).finally(() => !cancelled && setHistoryLoading(false))
    return () => { cancelled = true }
  }, [date, gamePk, games, reloadKey])

  const game = games.find(g => g.gamePk === gamePk) ?? null
  const players = useMemo(() => game ? [...game.awayLineup, ...game.homeLineup] : [], [game])
  useEffect(() => { setSelected(new Set(players.map(p => p.mlb_id))) }, [gamePk, players])
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem('slipsurge:odds-terminal:presets') ?? '[]')
        if (Array.isArray(stored)) setPresets(stored.slice(0, 6))
        const saved = JSON.parse(localStorage.getItem('slipsurge:odds-terminal:state') ?? 'null')
        if (saved && typeof saved === 'object') {
          if (MARKETS.some(([key]) => key === saved.market)) setMarket(saved.market)
          if (Array.isArray(saved.books)) setSelectedBooks(new Set(saved.books.filter((book: BookKey) => BOOKS.some(([key]) => key === book))))
          if (['odds', 'probability', 'delta'].includes(saved.mode)) setMode(saved.mode)
          if (saved.windowHours === null || TIME_WINDOWS.includes(saved.windowHours)) setWindowHours(saved.windowHours)
          if (saved.lineView === 'all' || saved.lineView === 'movers') setLineView(saved.lineView)
          if (typeof saved.filtersOpen === 'boolean') setFiltersOpen(saved.filtersOpen)
        }
        if (!localStorage.getItem('slipsurge:odds-terminal:guide-seen')) setShowGuide(true)
      } catch { /* Ignore invalid local preferences. */ }
      setPreferencesReady(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!preferencesReady) return
    localStorage.setItem('slipsurge:odds-terminal:state', JSON.stringify({ market, books: [...selectedBooks], mode, windowHours, lineView, filtersOpen }))
  }, [preferencesReady, market, selectedBooks, mode, windowHours, lineView, filtersOpen])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2200)
    return () => window.clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMarketOpen(false); setActiveLineId(null); setPinnedLineIds(new Set())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  const normalizedSnapshots = useMemo(() => snapshots.map(snapshot => ({
    capturedAt: snapshot.captured_at,
    players: new Map(Object.values(snapshot.prop_map ?? {}).map(entry => [norm(entry.name ?? ''), entry])),
  })), [snapshots])
  const availableBooks = useMemo(() => {
    if (!normalizedSnapshots.length) return new Map<string, number>()
    return new Map(BOOKS.map(([key]) => [key, players.reduce((count, player) => {
      const hasPrice = normalizedSnapshots.some(snapshot => {
        const prices = snapshot.players.get(norm(player.name))?.[market] as PriceMap | undefined
        return numericPrice(prices?.[key]) != null
      })
      return count + (hasPrice ? 1 : 0)
    }, 0)]))
  }, [normalizedSnapshots, players, market])
  const availableBookKeys = useMemo(() => BOOKS.filter(([key]) => (availableBooks.get(key) ?? 0) > 0).map(([key]) => key), [availableBooks])

  const series = useMemo<Series[]>(() => players.flatMap(player => {
    if (!selected.has(player.mlb_id)) return []
    return BOOKS.flatMap(([book, bookLabel]) => {
      if (!selectedBooks.has(book)) return []
      const points: SeriesPoint[] = []
      let opening: number | null = null
      for (const snapshot of normalizedSnapshots) {
        const entry = snapshot.players.get(norm(player.name))
        const odds = numericPrice((entry?.[market] as PriceMap | undefined)?.[book])
        if (odds == null) continue
        opening ??= odds
        const last = points.at(-1)
        if (!last || last.odds !== odds) points.push({ time: new Date(snapshot.capturedAt).getTime(), odds, value: odds - opening })
      }
      if (!points.length || opening == null) return []
      const current = points.at(-1)!.odds
      return [{ id: `${player.mlb_id}:${book}`, playerId: player.mlb_id, name: player.name, team: player.team, book, bookLabel, color: BOOK_COLORS[book], points, open: opening, current, move: current - opening }]
    })
  }), [players, normalizedSnapshots, market, selectedBooks, selected])

  const ranked = useMemo(() => [...series].sort((a, b) => moveSort === 'current' ? a.current - b.current : moveSort === 'player' ? a.name.localeCompare(b.name) : moveSort === 'book' ? a.bookLabel.localeCompare(b.bookLabel) || a.name.localeCompare(b.name) : Math.abs(b.move) - Math.abs(a.move)), [series, moveSort])
  const displayedSeries = useMemo(() => {
    const base = lineView === 'movers' ? [...series].sort((a, b) => Math.abs(b.move) - Math.abs(a.move)).slice(0, 12) : series
    const focusIds = new Set([...pinnedLineIds, ...(activeLineId ? [activeLineId] : [])])
    if (!focusIds.size) return base
    return [...new Map([...base, ...series.filter(item => focusIds.has(item.id))].map(item => [item.id, item])).values()]
  }, [series, lineView, activeLineId, pinnedLineIds])
  const focusedSeries = useMemo(() => series.filter(item => item.id === activeLineId || pinnedLineIds.has(item.id)), [series, activeLineId, pinnedLineIds])
  const marketGroups = useMemo(() => {
    const filtered = MARKETS.filter(([, label]) => norm(label).includes(norm(marketQuery)))
    return Array.from(new Set(filtered.map(([, , group]) => group))).map(group => ({ group, markets: filtered.filter(([, , candidate]) => candidate === group) }))
  }, [marketQuery])
  const currentMarketLabel = MARKETS.find(([key]) => key === market)?.[1] ?? 'Select market'
  const dateStrip = [-3,-2,-1,0,1,2,3].map(n => offsetDate(date, n))
  const chooseDate = (next: string) => { setDate(next); router.replace(`/odds-terminal?date=${next}`) }
  const historical = date < todayET()
  const hasHistory = snapshots.length > 0
  const resetView = () => {
    setMarket('fhr'); setSelectedBooks(new Set(availableBookKeys.length ? availableBookKeys : BOOKS.map(([key]) => key)))
    setMode('odds'); setWindowHours(null); setLineView('movers'); setScope('game'); setSelected(new Set(players.map(player => player.mlb_id))); setActiveLineId(null); setPinnedLineIds(new Set())
  }
  const changeScope = (next: 'game' | 'player') => {
    setScope(next)
    if (next === 'game') setSelected(new Set(players.map(player => player.mlb_id)))
    else {
      const playerId = selected.values().next().value ?? players[0]?.mlb_id
      setSelected(playerId ? new Set([playerId]) : new Set())
    }
  }
  const savePreset = () => {
    const name = presetName.trim()
    if (!name) return
    const next = [{ id: `${Date.now()}`, name: name.slice(0, 24), market, books: [...selectedBooks], mode, windowHours, lineView }, ...presets].slice(0, 6)
    setPresets(next); setPresetName(''); setNotice('View saved.')
    localStorage.setItem('slipsurge:odds-terminal:presets', JSON.stringify(next))
  }
  const applyPreset = (preset: ViewPreset) => {
    setMarket(preset.market); setSelectedBooks(new Set(preset.books)); setMode(preset.mode); setWindowHours(preset.windowHours); setLineView(preset.lineView); setActiveLineId(null); setPinnedLineIds(new Set()); setNotice('View applied.')
  }
  const removePreset = (id: string) => {
    const next = presets.filter(preset => preset.id !== id)
    setPresets(next); localStorage.setItem('slipsurge:odds-terminal:presets', JSON.stringify(next))
  }
  const closeGuide = () => { setShowGuide(false); localStorage.setItem('slipsurge:odds-terminal:guide-seen', '1') }
  const toggleLineFocus = (id: string) => setActiveLineId(current => current === id ? null : id)
  const togglePinnedLine = (id: string) => setPinnedLineIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })

  return <div className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroIcon}><Activity size={22}/><span/></div>
      <div><div className={styles.eyebrow}><span>ULTIMATE</span> ODDS HISTORY</div><h1>Odds Movement Terminal</h1><p>Compare captured prices by player, market, sportsbook, and time.</p></div>
      <div className={styles.liveBadge}><i/>{historyLoading ? 'SYNCING' : historical ? 'ARCHIVED HISTORY' : 'LIVE HISTORY'}</div>
    </header>

    <div className={styles.dateStrip}>
      <button onClick={() => chooseDate(offsetDate(date,-1))} aria-label="Previous date"><ChevronLeft size={17}/></button>
      {dateStrip.map(value => <button key={value} data-active={value===date} onClick={() => chooseDate(value)}><small>{new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}</small><strong>{new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</strong></button>)}
      <button onClick={() => chooseDate(offsetDate(date,1))} aria-label="Next date"><ChevronRight size={17}/></button>
    </div>

    {error && <div className={styles.error}><AlertCircle size={16}/><span>{error}</span><button type="button" onClick={()=>setReloadKey(value=>value+1)}><RefreshCw size={13}/>RETRY</button></div>}
    <section className={styles.gameRail} aria-label="Select game">
      {loading ? Array.from({length:6},(_,i)=><div className={styles.gameSkeleton} key={i}/>) : games.map(g => <button key={g.gamePk} data-active={g.gamePk===gamePk} onClick={() => setGamePk(g.gamePk)} aria-label={`${g.awayAbbr} at ${g.homeAbbr}`}>
        <span style={{'--team':getTeamColor(g.awayAbbr)} as CSSProperties}><img src={getTeamLogoUrl(g.awayAbbr)} alt=""/></span><b>VS</b><span style={{'--team':getTeamColor(g.homeAbbr)} as CSSProperties}><img src={getTeamLogoUrl(g.homeAbbr)} alt=""/></span><small>{g.status === 'Final' ? 'FINAL' : new Date(g.gameDate).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small>
      </button>)}
    </section>

    {game && <>
      <section className={styles.matchupHeader}>
        <div><span className={styles.pitcherAvatar} style={{'--team':getTeamColor(game.awayAbbr)} as CSSProperties}>{game.awayPitcher?.id ? <img src={mlbHeadshot(game.awayPitcher.id)} alt=""/> : null}<img className={styles.pitcherTeamLogo} src={getTeamLogoUrl(game.awayAbbr)} alt=""/></span><div><small>{historical ? 'FINAL STARTER' : 'PROJECTED STARTER'}</small><strong>{game.awayPitcher?.name ?? 'TBD'}</strong><span>{game.awayPitcher?.hand ? `${game.awayPitcher.hand}HP` : 'Hand TBD'}</span></div></div>
        <div className={styles.matchupPulse}><span/><b>{captureCount.toLocaleString()}</b><small>CAPTURES</small></div>
        <div><div><small>{historical ? 'FINAL STARTER' : 'PROJECTED STARTER'}</small><strong>{game.homePitcher?.name ?? 'TBD'}</strong><span>{game.homePitcher?.hand ? `${game.homePitcher.hand}HP` : 'Hand TBD'}</span></div><span className={styles.pitcherAvatar} style={{'--team':getTeamColor(game.homeAbbr)} as CSSProperties}>{game.homePitcher?.id ? <img src={mlbHeadshot(game.homePitcher.id)} alt=""/> : null}<img className={styles.pitcherTeamLogo} src={getTeamLogoUrl(game.homeAbbr)} alt=""/></span></div>
      </section>

      <section className={styles.terminal}>
        <div className={styles.terminalBar}>
          <button type="button" data-active={filtersOpen} onClick={()=>setFiltersOpen(value=>!value)}><SlidersHorizontal size={14}/><span>SETUP</span><ChevronDown size={13}/></button>
          <div className={styles.quickPresets}>{presets.map(preset=><span key={preset.id}><button type="button" onClick={()=>applyPreset(preset)}>{preset.name}</button><button type="button" aria-label={`Delete ${preset.name}`} onClick={()=>removePreset(preset.id)}><X size={10}/></button></span>)}</div>
          <div className={styles.terminalBarActions}><button type="button" onClick={resetView}><RotateCcw size={13}/>RESET</button><button type="button" aria-label="Open guide" onClick={()=>setShowGuide(true)}><HelpCircle size={14}/></button></div>
        </div>
        <div className={styles.filterRail} data-open={filtersOpen}>
          <div className={styles.marketControl}><span>MARKET</span><button type="button" aria-expanded={marketOpen} onClick={()=>setMarketOpen(value=>!value)}><strong>{currentMarketLabel}</strong><ChevronDown size={14}/></button>{marketOpen&&<div className={styles.marketMenu}><label><Search size={13}/><input autoFocus value={marketQuery} onChange={event=>setMarketQuery(event.target.value)} placeholder="Find a market"/></label><div>{marketGroups.map(group=><section key={group.group}><span>{group.group}</span>{group.markets.map(([key,label])=><button type="button" key={key} data-active={market===key} onClick={()=>{setMarket(key);setMarketOpen(false);setMarketQuery('')}}>{label}{market===key&&<Check size={12}/>}</button>)}</section>)}</div>{!marketGroups.length&&<p>No markets found.</p>}</div>}</div>
          <div className={styles.bookControl}><div className={styles.bookLabel}><span>SPORTSBOOKS</span><div><button type="button" disabled={!availableBookKeys.length||availableBookKeys.every(key=>selectedBooks.has(key))} onClick={()=>setSelectedBooks(new Set(availableBookKeys))}>ALL</button><button type="button" disabled={!selectedBooks.size} onClick={()=>setSelectedBooks(new Set())}>CLEAR</button></div></div><div className={styles.bookPicker}>{BOOKS.map(([key,label])=>{const count=availableBooks.get(key)??0;const disabled=normalizedSnapshots.length>0&&count===0;const active=selectedBooks.has(key)&&!disabled;return <button type="button" key={key} title={disabled?`${label} is not available for this market`:`${active?'Hide':'Show'} ${label}`} aria-label={`${active?'Hide':'Show'} ${label}`} aria-pressed={active} data-active={active} disabled={disabled} style={{'--book-color':BOOK_COLORS[key]} as CSSProperties} onClick={()=>setSelectedBooks(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next})}><i/><BookLogo vendor={key} size={17}/><span>{label}</span>{normalizedSnapshots.length>0&&<b>{count}</b>}<Check className={styles.bookCheck} size={11}/></button>})}</div></div>
          <div className={styles.controlBlock}><span>PLAYERS</span><div className={styles.segmented}><button type="button" data-active={scope==='game'} onClick={()=>changeScope('game')}><UsersRound size={12}/>FULL GAME</button><button type="button" data-active={scope==='player'} onClick={()=>changeScope('player')}><UserRound size={12}/>ONE PLAYER</button></div></div>
          <div className={styles.controlBlock}><span>DISPLAY</span><div className={styles.segmented}>{(['odds','probability','delta'] as const).map(value=><button key={value} data-active={mode===value} onClick={()=>setMode(value)}>{value === 'probability' ? 'IMPLIED %' : value.toUpperCase()}</button>)}</div></div>
          <div className={styles.controlBlock}><span>LINES</span><div className={styles.segmented}><button type="button" data-active={lineView==='movers'} onClick={()=>setLineView('movers')}>TOP 12</button><button type="button" data-active={lineView==='all'} onClick={()=>setLineView('all')}>ALL</button></div></div>
          <div className={styles.saveView}><span>SAVE VIEW</span><div><input value={presetName} maxLength={24} onChange={event=>setPresetName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')savePreset()}} placeholder="View name"/><button type="button" disabled={!presetName.trim()} onClick={savePreset}><Bookmark size={13}/></button></div></div>
        </div>
        <div className={styles.terminalStatus}><span><Crosshair size={13}/>{displayedSeries.length}{displayedSeries.length!==series.length?` of ${series.length}`:''} lines shown</span>{firstPitchAt?<span data-frozen>Frozen at first pitch, {new Date(firstPitchAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</span>:<span>{historical?'Pregame history':'Updates before first pitch'}</span>}</div>
        <div className={styles.bookLegend}><span>LINE COLOR</span>{BOOKS.filter(([key])=>selectedBooks.has(key)&&(availableBooks.get(key)??0)>0).map(([key,label])=><div key={key} style={{'--book-color':BOOK_COLORS[key]} as CSSProperties}><i/><BookLogo vendor={key} size={13}/><span>{label}</span></div>)}</div>
        {focusedSeries.length>0&&<div className={styles.focusBar}><span>FOCUSED LINES</span><div>{focusedSeries.map(item=><button type="button" key={item.id} style={{'--signal':item.color} as CSSProperties} onClick={()=>toggleLineFocus(item.id)}><img src={mlbHeadshot(item.playerId)} alt=""/><BookLogo vendor={item.book} size={11}/><strong>{item.name}</strong><small>{item.bookLabel}</small>{pinnedLineIds.has(item.id)&&<Pin size={10}/>}</button>)}</div><button type="button" onClick={()=>{setActiveLineId(null);setPinnedLineIds(new Set())}}>SHOW ALL</button></div>}
        <div className={styles.chartGrid}>
          <div className={styles.chartPanel}><div className={styles.chartTitle}><div><span>{currentMarketLabel}</span><strong>{selectedBooks.size ? `${selectedBooks.size} sportsbook${selectedBooks.size===1?'':'s'}` : 'Select a sportsbook'}</strong></div><div className={styles.chartControls}><div className={styles.timeWindows} aria-label="Timeline window">{TIME_WINDOWS.map(value=><button type="button" key={value??'all'} data-active={windowHours===value} onClick={()=>setWindowHours(value)}>{value==null?'ALL':`${value}H`}</button>)}</div><button type="button" aria-label="Zoom out" title="Show more time" onClick={()=>{const index=TIME_WINDOWS.indexOf(windowHours as never);setWindowHours(TIME_WINDOWS[Math.max(0,index-1)]??null)}}><ZoomOut size={14}/></button><button type="button" aria-label="Zoom in" title="Show less time" onClick={()=>{const index=TIME_WINDOWS.indexOf(windowHours as never);setWindowHours(TIME_WINDOWS[Math.min(TIME_WINDOWS.length-1,index+1)]??1)}}><ZoomIn size={14}/></button><span className={styles.moveLegend}><i className={styles.shorter}/>SHORTER <i className={styles.longer}/>LONGER</span></div></div>{historyLoading ? <div className={styles.loadingChart}><RefreshCw size={24}/><span>Loading price history.</span></div> : !hasHistory ? <div className={styles.emptyChart}><Activity size={28}/><strong>No price history is available</strong><span>Try another game or market.</span></div> : <MovementChart series={displayedSeries} mode={mode} windowHours={windowHours} activeLineId={activeLineId} pinnedLineIds={pinnedLineIds} onLineClick={toggleLineFocus}/>}</div>
          <aside className={styles.leaderboard}><header><div><Sparkles size={15}/>MOVE BOARD</div><label><span>SORT</span><select aria-label="Sort movement board" value={moveSort} onChange={event=>setMoveSort(event.target.value as typeof moveSort)}><option value="move">Largest move</option><option value="current">Current price</option><option value="player">Player</option><option value="book">Sportsbook</option></select></label></header>{ranked.length ? ranked.map((s,i)=><div key={s.id} role="button" tabIndex={0} data-active={activeLineId===s.id} data-pinned={pinnedLineIds.has(s.id)} onClick={()=>toggleLineFocus(s.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleLineFocus(s.id)}}}><em>{i+1}</em><i style={{background:s.color}}/><span><strong>{s.name}</strong><small><BookLogo vendor={s.book} size={10}/>{s.bookLabel}</small></span><span className={styles.movePrices}><small>OPEN</small><b>{oddsLabel(s.open)}</b><small>NOW</small><b>{oddsLabel(s.current)}</b></span><b data-direction={s.move<0?'shorter':s.move>0?'longer':'flat'}>{s.move>0?'+':''}{Math.round(s.move)}</b><button type="button" aria-label={`${pinnedLineIds.has(s.id)?'Unpin':'Pin'} ${s.name}, ${s.bookLabel}`} data-active={pinnedLineIds.has(s.id)} onClick={event=>{event.stopPropagation();togglePinnedLine(s.id)}}><Pin size={12}/></button></div>) : <p>No selected players have this market and sportsbook combination.</p>}</aside>
        </div>
      </section>

      <section className={styles.rosterPanel}>
        <header><div><Layers3 size={17}/><span>PLAYER LAYERS</span><b>{selected.size}/{players.length}</b></div><div className={styles.search}><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find player"/></div>{scope==='game'&&<div className={styles.layerActions}><button type="button" disabled={selected.size===players.length} onClick={()=>setSelected(new Set(players.map(p=>p.mlb_id)))}>SELECT ALL</button><button type="button" disabled={selected.size===0} onClick={()=>setSelected(new Set())}>CLEAR ALL</button></div>}</header>
        <div className={styles.rosters}>{[game.awayLineup,game.homeLineup].map((lineup,side)=>{const confirmed = side === 0 ? game.awayLineupConfirmed : game.homeLineupConfirmed;const lineupIds=lineup.map(player=>player.mlb_id);const allSelected=lineupIds.length>0&&lineupIds.every(id=>selected.has(id));return <div key={side}><div className={styles.teamMarker}><img src={getTeamLogoUrl(side===0?game.awayAbbr:game.homeAbbr)} alt=""/><span>{historical ? 'FINAL LINEUP' : confirmed ? 'CONFIRMED LINEUP' : 'PROJECTED LINEUP'}</span>{scope==='game'&&<div><button type="button" disabled={allSelected} onClick={()=>setSelected(current=>new Set([...current,...lineupIds]))}>ALL</button><button type="button" disabled={!lineupIds.some(id=>selected.has(id))} onClick={()=>setSelected(current=>{const next=new Set(current);lineupIds.forEach(id=>next.delete(id));return next})}>CLEAR</button></div>}</div>{lineup.filter(p=>norm(p.name).includes(norm(query))).map((p,index)=>{const active=selected.has(p.mlb_id);const color=COLORS[players.findIndex(x=>x.mlb_id===p.mlb_id)%COLORS.length];return <button key={p.mlb_id} data-active={active} onClick={()=>setSelected(current=>{if(scope==='player')return new Set([p.mlb_id]);const next=new Set(current);if(next.has(p.mlb_id))next.delete(p.mlb_id);else next.add(p.mlb_id);return next})}><em>{p.batting_order ?? index+1}</em><span className={styles.avatar} style={{'--team':getTeamColor(p.team)} as CSSProperties}><img src={mlbHeadshot(p.mlb_id)} alt=""/></span><span><strong>{p.name}</strong><small>{p.position??'TBD'}</small></span><i style={{background:active?color:'transparent'}}>{active&&<Check size={11}/>}</i></button>})}</div>})}</div>
      </section>
    </>}
    {notice&&<div className={styles.notice} role="status"><Check size={14}/>{notice}</div>}
    {showGuide&&<div className={styles.guideBackdrop} role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)closeGuide()}}><section className={styles.guideModal} role="dialog" aria-modal="true" aria-labelledby="terminal-guide-title"><button type="button" className={styles.guideClose} aria-label="Close guide" onClick={closeGuide}><X size={16}/></button><div className={styles.guideIcon}><Activity size={22}/></div><small>QUICK START</small><h2 id="terminal-guide-title">Use Odds Terminal</h2><ol><li><b>1</b><span><strong>Choose a game and market.</strong><small>Use Setup to adjust the terminal.</small></span></li><li><b>2</b><span><strong>Select sportsbooks and players.</strong><small>Show the full game or focus on one player.</small></span></li><li><b>3</b><span><strong>Inspect and compare.</strong><small>Select a line to focus it. Pin lines to keep them visible together.</small></span></li></ol><p>Price history stops at first pitch.</p><button type="button" className={styles.guideDone} onClick={closeGuide}>GOT IT</button></section></div>}
  </div>
}
