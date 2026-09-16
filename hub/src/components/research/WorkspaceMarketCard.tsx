'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Gauge, LoaderCircle, Radar, Target, Wind, X } from 'lucide-react'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { BookLogo } from '@/components/BookLogo'
import { MarketBaselineRead } from '@/components/dugout/MarketBaselineRead'
import styles from './WorkspaceMarketCard.module.css'

export type WorkspaceSavedMarket = {
  id: string
  sport: string
  game_pk: string | null
  game_date: string | null
  mlb_id: number | null
  player_name: string
  team: string | null
  position: string | null
  headshot_url: string | null
  prop_label: string
  line: string | null
  book: string | null
  odds: number | null
  odds_by_book: Record<string, number> | null
  notes: string | null
}

type WindowKey = 'l1' | 'l3' | 'l5' | 'l10'
type Offer = { book: string; price: number }
type Context = {
  hr: number | null
  hrOpen: number | null
  hrBaseline: number | null
  fhr: number | null
  fhrOpen: number | null
  fhrBaseline: number | null
  hrBooks: Offer[]
  fhrBooks: Offer[]
  mm: number | null
  pitchFit: number | null
  barrel: number | null
  barrelDelta: number | null
  hardHitDelta: number | null
  pullAir: number | null
}

const cache = new Map<string, Promise<unknown>>()
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const number = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return null
}
const odds = (value: number | null) => value == null ? '—' : `${Math.round(value) > 0 ? '+' : ''}${Math.round(value)}`
const signed = (value: number | null, suffix = '') => value == null ? '—' : `${value > 0 ? '+' : ''}${Math.round(value)}${suffix}`

function offers(value: unknown): Offer[] {
  const source = record(value)
  return Object.entries(source).flatMap(([book, raw]) => {
    const sourceValue = record(raw)
    const price = number(raw, sourceValue.odds, sourceValue.price, sourceValue.current)
    return price == null ? [] : [{ book, price }]
  }).sort((a, b) => a.price - b.price)
}

function findPlayer(payload: unknown, item: WorkspaceSavedMarket): Record<string, unknown> | null {
  const root = record(payload)
  const games = list(root.games ?? root.data)
  const game = games.map(record).find(candidate => {
    const id = candidate.gamePk ?? candidate.game_pk ?? candidate.id
    return item.game_pk ? String(id) === String(item.game_pk) : true
  })
  if (!game) return null
  const pools = [
    game.homeLineup, game.awayLineup, game.home_lineup, game.away_lineup,
    record(game.home).lineup, record(game.away).lineup,
    game.players,
  ]
  const players = pools.flatMap(list).map(record)
  return players.find(player => {
    const id = player.mlbId ?? player.mlb_id ?? player.playerId ?? player.id
    if (item.mlb_id != null && String(id) === String(item.mlb_id)) return true
    return String(player.name ?? player.player_name ?? '').toLowerCase() === item.player_name.toLowerCase()
  }) ?? null
}

function contextFrom(payload: unknown, item: WorkspaceSavedMarket, windowKey: WindowKey): Context | null {
  const player = findPlayer(payload, item)
  if (!player) return null
  const props = record(player.props)
  const hrMarket = record(props.sa ?? props.hr ?? props.homeRun)
  const fhrMarket = record(props.fhr ?? props.firstHomeRun)
  const opens = record(props.open ?? player.opening)
  const avgHr = record(player.saAvg ?? player.hrAvg ?? player.hr_avg)
  const avgFhr = record(player.fhrAvg ?? player.fhr_avg)
  const research = record(player.research)
  const mmByWindow = record(research.mmByWindow ?? research.mm_by_window)
  const statcast = record(player.statcast)
  const recent = record(statcast[windowKey] ?? statcast[windowKey.toUpperCase()])
  const season = record(statcast.season ?? statcast.szn)
  const hrBooks = offers(hrMarket)
  const fhrBooks = offers(fhrMarket)
  const hr = number(hrMarket.fanduel, hrMarket.fd, item.odds, hrBooks[0]?.price)
  const fhr = number(fhrMarket.fanduel, fhrMarket.fd, fhrBooks[0]?.price)
  const barrel = number(recent.barrelPct, recent.barrel_pct, recent.barrelRate, recent.brl)
  const seasonBarrel = number(season.barrelPct, season.barrel_pct, season.barrelRate, season.brl)
  const hardHit = number(recent.hardHitPct, recent.hard_hit_pct, recent.hardHitRate)
  const seasonHardHit = number(season.hardHitPct, season.hard_hit_pct, season.hardHitRate)
  const pullAir = number(recent.pullAirRate, recent.pull_air_rate, recent.pullAirPct, recent.pull_air_pct)
  return {
    hr,
    hrOpen: number(opens.sa_fd, opens.hr_fd, record(opens.sa).fanduel, record(opens.hr).fanduel),
    hrBaseline: number(avgHr.fd, avgHr.fanduel, avgHr.cz, avgHr.caesars),
    fhr,
    fhrOpen: number(opens.fhr_fd, record(opens.fhr).fanduel),
    fhrBaseline: number(avgFhr.fd, avgFhr.fanduel, avgFhr.cz, avgFhr.caesars),
    hrBooks: hrBooks.length ? hrBooks : offers(item.odds_by_book),
    fhrBooks,
    mm: number(mmByWindow[windowKey], research.mm, player.mm),
    pitchFit: number(research.pitchFit, research.pitch_fit, player.pitchFit),
    barrel,
    barrelDelta: barrel != null && seasonBarrel != null ? barrel - seasonBarrel : null,
    hardHitDelta: hardHit != null && seasonHardHit != null ? hardHit - seasonHardHit : null,
    pullAir,
  }
}

export function WorkspaceMarketCard({ item, windowKey, onRemove }: { item: WorkspaceSavedMarket; windowKey: WindowKey; onRemove: () => void }) {
  const [context, setContext] = useState<Context | null>(null)
  const [loading, setLoading] = useState(item.sport === 'MLB' && Boolean(item.game_date))

  useEffect(() => {
    let live = true
    if (item.sport !== 'MLB' || !item.game_date) { setLoading(false); return }
    const url = `/api/dugout/data?date=${encodeURIComponent(item.game_date)}&research=1`
    let request = cache.get(url)
    if (!request) {
      request = fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(async response => {
        if (!response.ok) throw new Error('Dugout context unavailable')
        return response.json() as Promise<unknown>
      })
      cache.set(url, request)
    }
    setLoading(true)
    request.then(payload => { if (live) setContext(contextFrom(payload, item, windowKey)) }).catch(() => { if (live) setContext(null) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [item, windowKey])

  const savedOffers = useMemo(() => offers(item.odds_by_book), [item.odds_by_book])
  const hrBooks = context?.hrBooks.length ? context.hrBooks : savedOffers
  const marketContext = context ?? {
    hr: item.odds, hrOpen: null, hrBaseline: null, fhr: null, fhrOpen: null, fhrBaseline: null,
    hrBooks, fhrBooks: [], mm: null, pitchFit: null, barrel: null, barrelDelta: null, hardHitDelta: null, pullAir: null,
  }
  const factors = [
    { label: 'MM', value: signed(marketContext.mm), metric: marketContext.mm, Icon: Radar },
    { label: 'Pitch fit', value: marketContext.pitchFit == null ? '—' : String(Math.round(marketContext.pitchFit)), metric: marketContext.pitchFit == null ? null : marketContext.pitchFit - 50, Icon: Target },
    { label: 'Barrel', value: marketContext.barrel == null ? '—' : `${marketContext.barrel.toFixed(1)}%`, metric: marketContext.barrelDelta, Icon: Gauge },
    { label: 'Hard-hit', value: signed(marketContext.hardHitDelta, 'pp'), metric: marketContext.hardHitDelta, Icon: Activity },
    { label: 'Pull-air', value: marketContext.pullAir == null ? '—' : `${(marketContext.pullAir <= 1 ? marketContext.pullAir * 100 : marketContext.pullAir).toFixed(1)}%`, metric: marketContext.pullAir, Icon: Wind },
  ]

  return <article className={styles.card}>
    <button className={styles.remove} type="button" onClick={onRemove} aria-label={`Remove ${item.player_name}`}><X size={14}/></button>
    <div className={styles.identity}>
      <PlayerAvatar headshot={item.headshot_url} teamAbbr={item.team} name={item.player_name} size={46}/>
      <span><strong>{item.player_name}</strong><small>{item.team ?? '—'} · {item.position ?? item.sport}</small><i>{item.prop_label}</i></span>
      {loading && <LoaderCircle className={styles.spin} size={14}/>}
    </div>

    <MarketBaselineRead hr={marketContext.hr} hrBaseline={marketContext.hrBaseline} fhr={marketContext.fhr} fhrBaseline={marketContext.fhrBaseline} compact className={styles.baseline}/>

    <div className={styles.books}>
      <span className={styles.bookLabel}><b>HR</b><small>sportsbooks</small></span>
      {hrBooks.slice(0, 5).map(offer => <span key={offer.book} title={offer.book}><BookLogo vendor={offer.book} size={18}/><b>{odds(offer.price)}</b></span>)}
      {!hrBooks.length && <em>No book split captured</em>}
    </div>
    {marketContext.fhrBooks.length > 0 && <div className={styles.books} data-fhr>
      <span className={styles.bookLabel}><b>FHR</b><small>sportsbooks</small></span>
      {marketContext.fhrBooks.slice(0, 5).map(offer => <span key={offer.book} title={offer.book}><BookLogo vendor={offer.book} size={18}/><b>{odds(offer.price)}</b></span>)}
    </div>}

    <div className={styles.heatmap}>
      {factors.map(({ label, value, metric, Icon }) => <span key={label} data-tone={metric == null ? 'neutral' : metric > 0 ? 'positive' : metric < 0 ? 'negative' : 'neutral'}><Icon size={12}/><small>{label}</small><b>{value}</b></span>)}
    </div>

    {item.notes && <p className={styles.note}>{item.notes}</p>}
  </article>
}
