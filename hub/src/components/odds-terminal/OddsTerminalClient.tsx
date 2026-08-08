'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Activity, Check, ChevronLeft, ChevronRight, Crosshair, Layers3, RefreshCw, Search, Sparkles, ZoomIn, ZoomOut } from 'lucide-react'
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
  ['fhr', 'First HR'], ['sa', 'Anytime HR'], ['hr2', '2+ HR'], ['hr3', '3+ HR'],
  ['hits', '1+ Hit'], ['hits2', '2+ Hits'], ['hits3', '3+ Hits'],
  ['singles', '1+ Single'], ['singles2', '2+ Singles'], ['doubles', '1+ Double'], ['triples', '1+ Triple'], ['rbi', '1+ RBI'], ['rbi2', '2+ RBI'],
  ['rbi3', '3+ RBI'], ['runs', 'Run'], ['runs2', '2+ Runs'], ['tb', '2+ Bases'], ['tb3', '3+ Bases'],
  ['tb4', '4+ Bases'], ['tb5', '5+ Bases'], ['stolen_bases', '1+ Stolen Base'], ['stolen_bases2', '2+ Stolen Bases'],
  ['strikeouts', '1+ Batter K'], ['strikeouts2', '2+ Batter Ks'], ['strikeouts3', '3+ Batter Ks'], ['hrr', 'H+R+RBI'],
] as const
const BOOKS = [['fanduel', 'FanDuel'], ['draftkings', 'DraftKings'], ['caesars', 'Caesars'], ['fanatics', 'Fanatics'], ['betmgm', 'BetMGM'], ['betrivers', 'BetRivers']] as const
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
  return value == null ? '—' : `${value > 0 ? '+' : ''}${Math.round(value)}`
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
type Series = { id: number; name: string; team: string; color: string; points: SeriesPoint[]; open: number; current: number; move: number }

const TIME_WINDOWS = [null, 12, 6, 2, 1] as const

function MovementChart({ series, mode, windowHours }: { series: Series[]; mode: 'odds' | 'probability' | 'delta'; windowHours: number | null }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number; time: number; clientX: number; clientY: number } | null>(null)
  const width = 1120, height = 480, left = 68, right = 26, top = 26, bottom = 52
  const allPoints = series.flatMap(s => s.points)
  if (!series.length || !allPoints.length) return <div className={styles.emptyChart}><Activity size={28} /><strong>Select at least one player with a posted line</strong><span>The terminal will render every captured move here.</span></div>
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
      {ticks.map((tick, i) => <g key={tick}><line x1={left} x2={width-right} y1={y(tick)} y2={y(tick)} stroke="url(#terminal-grid-fade)" strokeWidth="1"/><text x={left-12} y={y(tick)+4} textAnchor="end" className={styles.axisText}>{mode === 'odds' ? oddsLabel(tick) : `${tick.toFixed(1)}${mode === 'probability' ? '%' : ''}`}</text></g>)}
      {timeTicks.map(tick => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={top} y2={height-bottom} stroke="rgba(255,255,255,.045)"/><text x={x(tick)} y={height-20} textAnchor="middle" className={styles.axisText}>{new Date(tick).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</text></g>)}
      {mode === 'delta' && yMin < 0 && yMax > 0 && <line x1={left} x2={width-right} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.32)" strokeDasharray="5 6"/>}
      {visibleSeries.map(s => <g key={s.id} opacity={cursor && focusedId !== s.id ? .22 : .95}><polyline points={s.points.map(p => `${x(p.time)},${y(valueOf(p))}`).join(' ')} fill="none" stroke={s.color} strokeWidth={focusedId === s.id ? 4.5 : 2.6} strokeLinejoin="round" strokeLinecap="round"/><circle cx={x(s.points.at(-1)!.time)} cy={y(valueOf(s.points.at(-1)!))} r={focusedId === s.id ? 5.5 : 4} fill={s.color} stroke="#071016" strokeWidth="2"/></g>)}
      {cursor && <line x1={cursor.x} x2={cursor.x} y1={top} y2={height-bottom} stroke="#dffaff" strokeOpacity=".7" strokeDasharray="3 4"/>}
      {cursorEntries.slice(0, 4).map(s => <circle key={`cursor-${s.id}`} cx={x(s.point.time)} cy={y(valueOf(s.point))} r={s.id === focusedId ? 6 : 4} fill={s.color} stroke="#071016" strokeWidth="2.5"/>)}
    </svg>
    {cursor && typeof document !== 'undefined' && createPortal(<div className={styles.chartTooltip} data-side={cursor.clientX > window.innerWidth * .62 ? 'left' : 'right'} style={{ left: cursor.clientX, top: Math.max(76, Math.min(window.innerHeight - 300, cursor.clientY)) }}>
      <header><span>CAPTURE INSPECTOR</span><time>{new Date(cursorEntries[0]?.point.time ?? cursor.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</time></header>
      {cursorEntries.slice(0, 4).map((s, index) => { const step=s.previous?s.point.odds-s.previous.odds:0;const fromOpen=s.point.odds-s.open;return <div className={styles.inspectCard} data-focus={index===0} key={s.id} style={{'--signal':s.color} as CSSProperties}>
        <span className={styles.inspectAvatar}><img src={mlbHeadshot(s.id)} alt=""/><img src={getTeamLogoUrl(s.team)} alt=""/></span>
        <span className={styles.inspectIdentity}><strong>{s.name}</strong><small>{s.team} · captured {new Date(s.point.time).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></span>
        <span className={styles.inspectPrice}><strong>{oddsLabel(s.point.odds)}</strong><small>{(americanToProbability(s.point.odds)*100).toFixed(1)}% implied</small></span>
        <span className={styles.inspectMove}><small>LAST MOVE</small><b data-direction={step<0?'shorter':step>0?'longer':'flat'}>{step>0?'+':''}{Math.round(step)}</b></span>
        <span className={styles.inspectMove}><small>FROM OPEN</small><b data-direction={fromOpen<0?'shorter':fromOpen>0?'longer':'flat'}>{fromOpen>0?'+':''}{Math.round(fromOpen)}</b></span>
      </div>})}
      {cursorEntries.length > 4 && <footer>4 nearest signals · +{cursorEntries.length-4} active</footer>}
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
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [market, setMarket] = useState('fhr')
  const [book, setBook] = useState('fanatics')
  const [mode, setMode] = useState<'odds' | 'probability' | 'delta'>('odds')
  const [windowHours, setWindowHours] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setGames([]); setGamePk(null); setSnapshots([]); setCaptureCount(0)
    fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Could not load the slate.')
      return response.json()
    }).then(data => { if (!cancelled) { const next = data.games ?? []; setGames(next); setGamePk(next[0]?.gamePk ?? null) } }).catch(e => !cancelled && setError(e.message)).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [date])

  useEffect(() => {
    const selectedGame = games.find(candidate => candidate.gamePk === gamePk)
    if (!gamePk || !selectedGame) return
    let cancelled = false
    setHistoryLoading(true); setSnapshots([]); setCaptureCount(0)
    const resolvedGameKey = selectedGame.gameKey || `${selectedGame.awayAbbr}@${selectedGame.homeAbbr}`
    fetch(`/api/odds-terminal?date=${date}&gamePk=${gamePk}&gameKey=${encodeURIComponent(resolvedGameKey)}`).then(async response => {
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Could not load movement history.')
      return response.json()
    }).then(data => { if (!cancelled) { setSnapshots(data.snapshots ?? []); setCaptureCount(data.sourceCount ?? data.snapshots?.length ?? 0) } }).catch(e => !cancelled && setError(e.message)).finally(() => !cancelled && setHistoryLoading(false))
    return () => { cancelled = true }
  }, [date, gamePk, games])

  const game = games.find(g => g.gamePk === gamePk) ?? null
  const players = useMemo(() => game ? [...game.awayLineup, ...game.homeLineup] : [], [game])
  useEffect(() => { setSelected(new Set(players.map(p => p.mlb_id))) }, [gamePk, players])
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
  useEffect(() => {
    if (!normalizedSnapshots.length || (availableBooks.get(book) ?? 0) > 0) return
    const fallback = BOOKS.find(([key]) => (availableBooks.get(key) ?? 0) > 0)?.[0]
    if (fallback) setBook(fallback)
  }, [availableBooks, book, normalizedSnapshots.length])

  const series = useMemo<Series[]>(() => players.map((player, index) => {
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
    if (!points.length || opening == null) return null
    const current = points.at(-1)!.odds
    return { id: player.mlb_id, name: player.name, team: player.team, color: COLORS[index % COLORS.length], points, open: opening, current, move: current - opening }
  }).filter((s): s is Series => s != null && selected.has(s.id)), [players, normalizedSnapshots, market, book, selected])

  const ranked = [...series].sort((a, b) => a.move - b.move)
  const dateStrip = [-3,-2,-1,0,1,2,3].map(n => offsetDate(date, n))
  const chooseDate = (next: string) => { setDate(next); router.replace(`/odds-terminal?date=${next}`) }
  const historical = date < todayET()

  return <div className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroIcon}><Activity size={22}/><span/></div>
      <div><div className={styles.eyebrow}><span>ULTIMATE</span> MARKET INTELLIGENCE</div><h1>Odds Movement Terminal</h1><p>Replay every captured price move. Compare the full game, isolate the signal, find where the board diverged.</p></div>
      <div className={styles.liveBadge}><i/>{historyLoading ? 'SYNCING' : historical ? 'ARCHIVED HISTORY' : 'LIVE HISTORY'}</div>
    </header>

    <div className={styles.dateStrip}>
      <button onClick={() => chooseDate(offsetDate(date,-1))} aria-label="Previous date"><ChevronLeft size={17}/></button>
      {dateStrip.map(value => <button key={value} data-active={value===date} onClick={() => chooseDate(value)}><small>{new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}</small><strong>{new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}</strong></button>)}
      <button onClick={() => chooseDate(offsetDate(date,1))} aria-label="Next date"><ChevronRight size={17}/></button>
    </div>

    {error && <div className={styles.error}>{error}</div>}
    <section className={styles.gameRail} aria-label="Select game">
      {loading ? Array.from({length:6},(_,i)=><div className={styles.gameSkeleton} key={i}/>) : games.map(g => <button key={g.gamePk} data-active={g.gamePk===gamePk} onClick={() => setGamePk(g.gamePk)} aria-label={`${g.awayAbbr} at ${g.homeAbbr}`}>
        <span style={{'--team':getTeamColor(g.awayAbbr)} as CSSProperties}><img src={getTeamLogoUrl(g.awayAbbr)} alt=""/></span><b>VS</b><span style={{'--team':getTeamColor(g.homeAbbr)} as CSSProperties}><img src={getTeamLogoUrl(g.homeAbbr)} alt=""/></span><small>{g.status === 'Final' ? 'FINAL' : new Date(g.gameDate).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small>
      </button>)}
    </section>

    {game && <>
      <section className={styles.matchupHeader}>
        <div><span className={styles.pitcherAvatar} style={{'--team':getTeamColor(game.awayAbbr)} as CSSProperties}>{game.awayPitcher?.id ? <img src={mlbHeadshot(game.awayPitcher.id)} alt=""/> : null}<img className={styles.pitcherTeamLogo} src={getTeamLogoUrl(game.awayAbbr)} alt=""/></span><div><small>{historical ? 'FINAL STARTER' : 'PROJECTED STARTER'}</small><strong>{game.awayPitcher?.name ?? 'TBD'}</strong><span>{game.awayPitcher?.hand ?? '—'}HP</span></div></div>
        <div className={styles.matchupPulse}><span/><b>{captureCount.toLocaleString()}</b><small>CAPTURES</small></div>
        <div><div><small>{historical ? 'FINAL STARTER' : 'PROJECTED STARTER'}</small><strong>{game.homePitcher?.name ?? 'TBD'}</strong><span>{game.homePitcher?.hand ?? '—'}HP</span></div><span className={styles.pitcherAvatar} style={{'--team':getTeamColor(game.homeAbbr)} as CSSProperties}>{game.homePitcher?.id ? <img src={mlbHeadshot(game.homePitcher.id)} alt=""/> : null}<img className={styles.pitcherTeamLogo} src={getTeamLogoUrl(game.homeAbbr)} alt=""/></span></div>
      </section>

      <section className={styles.terminal}>
        <div className={styles.toolbar}>
          <label><span>MARKET</span><select value={market} onChange={e=>setMarket(e.target.value)}>{MARKETS.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
          <div className={styles.bookControl}><span>BOOK</span><div className={styles.bookPicker}>{BOOKS.map(([key,label])=>{const count=availableBooks.get(key)??0;const disabled=normalizedSnapshots.length>0&&count===0;return <button type="button" key={key} title={`${label}${normalizedSnapshots.length?` · ${count} players`:''}`} aria-label={`${label}${normalizedSnapshots.length?`, ${count} players with prices`:''}`} data-active={book===key} disabled={disabled} onClick={()=>setBook(key)}><BookLogo vendor={key} size={17}/><span>{label}</span>{normalizedSnapshots.length>0&&<b>{count}</b>}</button>})}</div></div>
          <div className={styles.segmented}>{(['odds','probability','delta'] as const).map(value=><button key={value} data-active={mode===value} onClick={()=>setMode(value)}>{value === 'probability' ? 'IMPLIED %' : value.toUpperCase()}</button>)}</div>
          <div className={styles.terminalMeta}><Crosshair size={14}/><span>{series.length} SIGNALS</span></div>
        </div>
        <div className={styles.chartGrid}>
          <div className={styles.chartPanel}><div className={styles.chartTitle}><div><span>{MARKETS.find(v=>v[0]===market)?.[1]}</span><strong>{BOOKS.find(v=>v[0]===book)?.[1]} movement</strong></div><div className={styles.chartControls}><div className={styles.timeWindows} aria-label="Timeline window">{TIME_WINDOWS.map(value=><button type="button" key={value??'all'} data-active={windowHours===value} onClick={()=>setWindowHours(value)}>{value==null?'ALL':`${value}H`}</button>)}</div><button type="button" aria-label="Zoom out" title="Show more time" onClick={()=>{const index=TIME_WINDOWS.indexOf(windowHours as never);setWindowHours(TIME_WINDOWS[Math.max(0,index-1)]??null)}}><ZoomOut size={14}/></button><button type="button" aria-label="Zoom in" title="Show less time" onClick={()=>{const index=TIME_WINDOWS.indexOf(windowHours as never);setWindowHours(TIME_WINDOWS[Math.min(TIME_WINDOWS.length-1,index+1)]??1)}}><ZoomIn size={14}/></button><span className={styles.moveLegend}><i className={styles.shorter}/>SHORTER <i className={styles.longer}/>LONGER</span></div></div>{historyLoading ? <div className={styles.loadingChart}><RefreshCw size={24}/><span>Loading every captured move…</span></div> : <MovementChart series={series} mode={mode} windowHours={windowHours}/>}</div>
          <aside className={styles.leaderboard}><header><div><Sparkles size={15}/>MOVE BOARD</div><span>OPEN → NOW</span></header>{ranked.length ? ranked.map((s,i)=><div key={s.id}><em>{i+1}</em><i style={{background:s.color}}/><span><strong>{s.name}</strong><small>{oddsLabel(s.open)} → {oddsLabel(s.current)}</small></span><b data-direction={s.move<0?'shorter':s.move>0?'longer':'flat'}>{s.move>0?'+':''}{Math.round(s.move)}</b></div>) : <p>No selected players have this market/book combination.</p>}</aside>
        </div>
      </section>

      <section className={styles.rosterPanel}>
        <header><div><Layers3 size={17}/><span>PLAYER LAYERS</span><b>{selected.size}/{players.length}</b></div><div className={styles.search}><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find player"/></div><div className={styles.layerActions}><button type="button" disabled={selected.size===players.length} onClick={()=>setSelected(new Set(players.map(p=>p.mlb_id)))}>SELECT ALL</button><button type="button" disabled={selected.size===0} onClick={()=>setSelected(new Set())}>CLEAR ALL</button></div></header>
        <div className={styles.rosters}>{[game.awayLineup,game.homeLineup].map((lineup,side)=>{const confirmed = side === 0 ? game.awayLineupConfirmed : game.homeLineupConfirmed;return <div key={side}><div className={styles.teamMarker}><img src={getTeamLogoUrl(side===0?game.awayAbbr:game.homeAbbr)} alt=""/><span>{historical ? 'FINAL LINEUP' : confirmed ? 'CONFIRMED LINEUP' : 'PROJECTED LINEUP'}</span></div>{lineup.filter(p=>norm(p.name).includes(norm(query))).map((p,index)=>{const active=selected.has(p.mlb_id);const color=COLORS[players.findIndex(x=>x.mlb_id===p.mlb_id)%COLORS.length];return <button key={p.mlb_id} data-active={active} onClick={()=>setSelected(current=>{const next=new Set(current);next.has(p.mlb_id)?next.delete(p.mlb_id):next.add(p.mlb_id);return next})}><em>{p.batting_order ?? index+1}</em><span className={styles.avatar} style={{'--team':getTeamColor(p.team)} as CSSProperties}><img src={mlbHeadshot(p.mlb_id)} alt=""/></span><span><strong>{p.name}</strong><small>{p.position??'—'}</small></span><i style={{background:active?color:'transparent'}}>{active&&<Check size={11}/>}</i></button>})}</div>})}</div>
      </section>
    </>}
  </div>
}
