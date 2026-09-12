'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { BookLogo } from '@/components/BookLogo'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { PROP_META } from '@/lib/watchlist'
import styles from './PickComposer.module.css'

type Sport = 'MLB' | 'NFL'
type Offer = { vendor: string; side: 'milestone' | 'over' | 'under'; odds: number }
type Market = { key: string; prop_type: string; label: string; line: number | null; offers: Offer[] }
type Player = {
  player_id: string | null
  mlb_id: number | null
  name: string
  team: string
  position: string
  headshot_url: string | null
  markets: Market[]
}
type Game = {
  gameKey: string
  gamePk: string
  gameDate: string
  gameTime?: string | null
  homeAbbr: string
  awayAbbr: string
  homeTeam: string
  awayTeam: string
  homeLogo?: string | null
  awayLogo?: string | null
  status: string
  players: Player[]
}
type RawMlbPlayer = { mlb_id?: number; name: string; team: string; position: string; props?: Record<string, Record<string, unknown>> }
type RawMlbGame = Omit<Game, 'gamePk' | 'gameDate' | 'players'> & { gamePk: string | number; homeLineup?: RawMlbPlayer[]; awayLineup?: RawMlbPlayer[] }

export type ComposedPick = {
  sport: Sport
  player_id: string | null
  mlb_id: number | null
  player_name: string
  team: string | null
  headshot_url: string | null
  game_pk: string | null
  game_date: string | null
  prop_key: string
  prop_label: string
  line: string
  numeric_line: number | null
  market_side: 'milestone' | 'over' | 'under'
  book: string | null
  odds: number | null
}

function TeamLogo({ src, abbr }: { src?: string | null; abbr: string }) {
  return src ? <Image src={src} alt="" width={24} height={24} unoptimized className={styles.teamLogo} /> : <span className={styles.teamFallback}>{abbr}</span>
}

function normalizeMlbGames(payload: RawMlbGame[], date: string): Game[] {
  return payload.map(game => ({
    gameKey: game.gameKey,
    gamePk: String(game.gamePk),
    gameDate: date,
    homeAbbr: game.homeAbbr,
    awayAbbr: game.awayAbbr,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeLogo: getTeamLogoUrl(game.homeAbbr),
    awayLogo: getTeamLogoUrl(game.awayAbbr),
    status: game.status || 'Preview',
    players: [...(game.homeLineup ?? []), ...(game.awayLineup ?? [])]
      .filter(player => player.mlb_id)
      .map((player): Player => ({
        player_id: null,
        mlb_id: player.mlb_id!,
        name: player.name,
        team: player.team,
        position: player.position,
        headshot_url: mlbHeadshot(player.mlb_id!),
        markets: Object.entries(PROP_META).flatMap(([key, meta]) => {
          const prices = player.props?.[key]
          if (!prices) return []
          const offers = Object.entries(prices).flatMap(([vendor, odds]) =>
            typeof odds === 'number' ? [{ vendor, side: 'milestone' as const, odds }] : [])
          return offers.length ? [{ key, prop_type: meta.pickType, label: meta.label, line: null, offers }] : []
        }),
      })),
  }))
}

function selectionKey(market: Market) {
  return `${market.key}::${market.line ?? ''}`
}

function labelFor(market: Market, side: Offer['side']) {
  if (side === 'milestone' || market.line == null) return market.label
  return `${side === 'over' ? 'Over' : 'Under'} ${market.line} ${market.label}`
}

export function PickComposer({ legs, onAddLeg, onRemoveLeg, onClose }: {
  legs: ComposedPick[]
  onAddLeg: (pick: ComposedPick) => void
  onRemoveLeg: (index: number) => void
  onClose: () => void
}) {
  const easternToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const lockedSport = legs[0]?.sport ?? null
  const lockedBook = legs[0]?.book ?? null
  const [selectedSport, setSelectedSport] = useState<Sport>('MLB')
  const sport = lockedSport ?? selectedSport
  const [gameDate, setGameDate] = useState(easternToday)
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gameKey, setGameKey] = useState('')
  const [playerQuery, setPlayerQuery] = useState('')
  const [playerOpen, setPlayerOpen] = useState(false)
  const [playerId, setPlayerId] = useState('')
  const [marketId, setMarketId] = useState('')
  const [side, setSide] = useState<Offer['side']>('milestone')
  const [book, setBook] = useState('')
  const playerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const endpoint = sport === 'NFL' ? '/api/composer/nfl-games' : `/api/composer/games?date=${easternToday}`
    fetch(endpoint)
      .then(async response => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Games are unavailable.')
        return response.json()
      })
      .then(payload => {
        if (cancelled) return
        const date = payload.date ?? easternToday
        setGameDate(date)
        setGames(sport === 'MLB' ? normalizeMlbGames((payload.games ?? []) as RawMlbGame[], date) : (payload.games ?? []))
      })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Games are unavailable.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sport, easternToday])

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (playerRef.current && !playerRef.current.contains(event.target as Node)) setPlayerOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const game = games.find(item => item.gameKey === gameKey) ?? null
  const players = useMemo(() => game?.players ?? [], [game])
  const player = players.find(item => (item.player_id ?? `mlb:${item.mlb_id}`) === playerId) ?? null
  const filteredPlayers = useMemo(() => {
    const query = playerQuery.trim().toLowerCase()
    return query ? players.filter(item => `${item.name} ${item.team} ${item.position}`.toLowerCase().includes(query)) : players
  }, [playerQuery, players])
  const market = player?.markets.find(item => selectionKey(item) === marketId) ?? null
  const sides = market ? Array.from(new Set(market.offers.map(offer => offer.side))) : []
  const offers = market?.offers.filter(offer => offer.side === side && (!lockedBook || offer.vendor === lockedBook)) ?? []
  const selectedOffer = offers.find(offer => offer.vendor === book) ?? null

  function chooseSport(next: Sport) {
    if (lockedSport || next === sport) return
    setSelectedSport(next)
    setLoading(true)
    setError('')
    setGames([])
    chooseGame('')
  }

  function chooseGame(next: string) {
    setGameKey(next)
    setPlayerId('')
    setPlayerQuery('')
    setMarketId('')
    setBook('')
  }

  function choosePlayer(next: Player) {
    setPlayerId(next.player_id ?? `mlb:${next.mlb_id}`)
    setPlayerQuery('')
    setPlayerOpen(false)
    setMarketId('')
    setBook('')
  }

  function chooseMarket(nextId: string) {
    setMarketId(nextId)
    const nextMarket = player?.markets.find(item => selectionKey(item) === nextId)
    const nextSides = nextMarket ? Array.from(new Set(nextMarket.offers.map(offer => offer.side))) : []
    const nextSide = nextSides.includes('over') ? 'over' : nextSides[0] ?? 'milestone'
    setSide(nextSide)
    setBook(nextMarket?.offers.find(offer => offer.side === nextSide && (!lockedBook || offer.vendor === lockedBook))?.vendor ?? '')
  }

  function chooseSide(next: Offer['side']) {
    setSide(next)
    setBook(market?.offers.find(offer => offer.side === next && (!lockedBook || offer.vendor === lockedBook))?.vendor ?? '')
  }

  function addLeg() {
    if (!game || !player || !market || !selectedOffer) return
    onAddLeg({
      sport,
      player_id: player.player_id,
      mlb_id: player.mlb_id,
      player_name: player.name,
      team: player.team,
      headshot_url: player.headshot_url,
      game_pk: game.gamePk,
      game_date: game.gameDate,
      prop_key: market.prop_type,
      prop_label: market.label,
      line: labelFor(market, side),
      numeric_line: market.line,
      market_side: side,
      book: selectedOffer.vendor,
      odds: selectedOffer.odds,
    })
    setPlayerId('')
    setPlayerQuery('')
    setMarketId('')
    setBook('')
  }

  return (
    <section className={styles.composer} aria-label="Add a structured pick">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{legs.length > 1 ? `${legs.length}-LEG PARLAY` : 'STRUCTURED PICK'}</span>
          <strong>Build from live market data</strong>
        </div>
        <button type="button" onClick={onClose} className={styles.iconButton} aria-label="Close pick builder"><X size={16} /></button>
      </header>

      <div className={styles.sportTabs} aria-label="Sport">
        {(['MLB', 'NFL'] as const).map(item => (
          <button key={item} type="button" data-active={sport === item} disabled={!!lockedSport && lockedSport !== item} onClick={() => chooseSport(item)}>
            {item === 'MLB' ? '⚾' : '🏈'} {item}
          </button>
        ))}
      </div>

      {legs.length > 0 && <div className={styles.legs}>
        {legs.map((leg, index) => <article className={styles.leg} key={`${leg.player_name}:${leg.prop_key}:${index}`}>
          <span className={styles.legIndex}>{index + 1}</span>
          <BookLogo vendor={leg.book ?? ''} size={17} />
          <div><strong>{leg.player_name}</strong><small>{leg.line}</small></div>
          <b>{leg.odds != null && leg.odds > 0 ? `+${leg.odds}` : leg.odds}</b>
          <button type="button" onClick={() => onRemoveLeg(index)} aria-label={`Remove ${leg.player_name}`}><X size={13} /></button>
        </article>)}
      </div>}

      <div className={styles.steps}>
        <label className={styles.field}>
          <span>Game <small>{gameDate}</small></span>
          <div className={styles.selectWrap}>
            <select value={gameKey} onChange={event => chooseGame(event.target.value)} disabled={loading || !games.length}>
              <option value="">{loading ? 'Loading schedule…' : games.length ? 'Choose a matchup' : 'No available games'}</option>
              {games.map(item => <option key={item.gameKey} value={item.gameKey} disabled={item.status !== 'Preview'}>
                {item.awayAbbr} @ {item.homeAbbr}{item.gameTime ? ` · ${item.gameTime}` : ''}{item.status !== 'Preview' ? ' · Started' : ''}
              </option>)}
            </select>
            <ChevronDown size={15} />
          </div>
        </label>

        {game && <div className={styles.matchupCard}>
          <TeamLogo src={game.awayLogo} abbr={game.awayAbbr} /><strong>{game.awayAbbr}</strong><span>@</span>
          <TeamLogo src={game.homeLogo} abbr={game.homeAbbr} /><strong>{game.homeAbbr}</strong>
        </div>}

        {game && <div className={styles.field} ref={playerRef}>
          <span>Player</span>
          {player ? <div className={styles.selectedPlayer}>
            <PlayerAvatar headshot={player.headshot_url} teamLogo={sport === 'MLB' ? getTeamLogoUrl(player.team) : undefined} teamAbbr={player.team} name={player.name} size={34} />
            <div><strong>{player.name}</strong><small>{player.team} · {player.position}</small></div>
            <Check size={15} />
            <button type="button" onClick={() => setPlayerId('')} aria-label="Change player"><X size={14} /></button>
          </div> : <div className={styles.playerSearch}>
            <Search size={16} />
            <input value={playerQuery} onChange={event => { setPlayerQuery(event.target.value); setPlayerOpen(true) }} onFocus={() => setPlayerOpen(true)} placeholder="Search this matchup" />
            {playerOpen && <div className={styles.playerMenu}>
              {filteredPlayers.length ? filteredPlayers.map(item => <button type="button" key={item.player_id ?? item.mlb_id} onClick={() => choosePlayer(item)}>
                <PlayerAvatar headshot={item.headshot_url} teamLogo={sport === 'MLB' ? getTeamLogoUrl(item.team) : undefined} teamAbbr={item.team} name={item.name} size={30} />
                <span><strong>{item.name}</strong><small>{item.team} · {item.position}</small></span>
              </button>) : <p>No matching players</p>}
            </div>}
          </div>}
        </div>}

        {player && <div className={styles.marketGrid}>
          <label className={styles.field}><span>Market</span><div className={styles.selectWrap}><select value={marketId} onChange={event => chooseMarket(event.target.value)}><option value="">Choose a market</option>{player.markets.map(item => <option key={selectionKey(item)} value={selectionKey(item)}>{item.label}{item.line == null ? '' : ` · ${item.line}`}</option>)}</select><ChevronDown size={15} /></div></label>
          {market && sides.length > 1 && <label className={styles.field}><span>Side</span><div className={styles.selectWrap}><select value={side} onChange={event => chooseSide(event.target.value as Offer['side'])}>{sides.map(item => <option value={item} key={item}>{item === 'over' ? 'Over' : item === 'under' ? 'Under' : 'To happen'}</option>)}</select><ChevronDown size={15} /></div></label>}
          {market && <label className={styles.field}><span>Sportsbook</span><div className={styles.selectWrap}><select value={book} onChange={event => setBook(event.target.value)} disabled={!offers.length}><option value="">{offers.length ? 'Choose a book' : `Not available${lockedBook ? ` on ${lockedBook}` : ''}`}</option>{offers.map(offer => <option key={offer.vendor} value={offer.vendor}>{offer.vendor} · {offer.odds > 0 ? '+' : ''}{offer.odds}</option>)}</select><ChevronDown size={15} /></div></label>}
        </div>}
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {market && selectedOffer && <footer className={styles.summary}>
        <div><BookLogo vendor={selectedOffer.vendor} size={20} /><span><strong>{player?.name}</strong><small>{labelFor(market, side)}</small></span></div>
        <b>{selectedOffer.odds > 0 ? '+' : ''}{selectedOffer.odds}</b>
        <button type="button" onClick={addLeg}><Plus size={15} /> Add leg</button>
      </footer>}
    </section>
  )
}
