'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { SafeImage } from '@/components/ui/SafeImage'
import { FAVORITE_PLAYERS_PER_SPORT, MLB_FAVORITE_TEAMS, favoritePlayerImages, favoritePlayerKey, favoritePlayerSport, favoriteSearchPlayers, favoriteTeamSelected, toggleFavoriteTeam, type FavoritePlayer, type FavoriteSport, type FavoriteTeam } from '@/lib/sportFavorites'
import { useAuth } from '@/context/AuthContext'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'

export function FavoritePicker({ teams, players, sports = [], allowNba = true, onTeamsChange, onPlayersChange }: {
  teams: string[]; players?: FavoritePlayer[]; sports?: string[]; allowNba?: boolean
  onTeamsChange: (teams: string[]) => void; onPlayersChange?: (players: FavoritePlayer[]) => void
}) {
  const { profile } = useAuth()
  const mlbAccess = !MLB_HIBERNATING || profile?.account_type === 'admin'
  const [chosenSport, setSport] = useState<FavoriteSport>(() => allowNba && sports.includes('NBA') ? 'nba' : 'nfl')
  const sport = chosenSport === 'mlb' && !mlbAccess ? 'nfl' : chosenSport
  const [catalog, setCatalog] = useState<FavoriteTeam[]>(MLB_FAVORITE_TEAMS)
  const [catalogError, setCatalogError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FavoritePlayer[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const searchEnabled = Boolean(onPlayersChange)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/account/favorites', { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error('Unavailable'); return response.json() })
      .then(data => { if (!controller.signal.aborted) { setCatalog(data.catalog); setCatalogError(false) } })
      .catch(() => { if (!controller.signal.aborted) setCatalogError(true) })
    return () => controller.abort()
  }, [attempt])
  useEffect(() => {
    if (query.trim().length < 2 || !searchEnabled) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setSearching(true); setSearchError(false)
      fetch(sport === 'nba' ? `/api/account/favorites/players?q=${encodeURIComponent(query.trim())}` : `/api/search/${sport === 'mlb' ? 'sports' : sport}?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then(async response => { if (!response.ok) throw new Error('Unavailable'); return response.json() })
        .then(data => { if (!controller.signal.aborted) setResults(favoriteSearchPlayers(sport, data.players)) })
        .catch(() => { if (!controller.signal.aborted) { setResults([]); setSearchError(true) } })
        .finally(() => { if (!controller.signal.aborted) setSearching(false) })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, sport, searchEnabled])
  const selectedPlayers = (players ?? []).filter(player => favoritePlayerSport(player) === sport && (allowNba || sport !== 'nba'))
  const visibleCatalog = catalog.filter(team => (allowNba || team.sport !== 'nba') && (mlbAccess || team.sport !== 'mlb'))
  function changeQuery(value: string) { setQuery(value); setResults([]); setSearching(value.trim().length >= 2); setSearchError(false) }
  function changeSport(value: FavoriteSport) { setSport(value); changeQuery('') }
  function addPlayer(player: FavoritePlayer) {
    if (!onPlayersChange || selectedPlayers.length >= FAVORITE_PLAYERS_PER_SPORT) return
    if (!(players ?? []).some(item => favoritePlayerKey(item) === favoritePlayerKey(player))) onPlayersChange([...(players ?? []), player])
    changeQuery('')
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Favorite league">
      {([...(mlbAccess ? ['mlb'] : []), 'nfl', ...(allowNba ? ['nba'] : [])] as FavoriteSport[]).map(league => <button key={league} type="button" aria-pressed={sport === league} onClick={() => changeSport(league)} className={`min-h-10 rounded-xl border px-4 text-xs font-bold transition ${sport === league ? 'border-lime-400/40 bg-lime-400/10 text-lime-300' : 'border-white/10 text-zinc-400 hover:bg-white/5'}`}>{league.toUpperCase()}</button>)}
    </div>
    <section aria-label={`Favorite ${sport.toUpperCase()} teams`}>
      <h3 className="mb-3 text-xs font-bold text-zinc-400">Favorite teams</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visibleCatalog.filter(team => team.sport === sport).map(team => {
          const selected = favoriteTeamSelected(team, teams, visibleCatalog, sports)
          return <button key={team.key} type="button" aria-pressed={selected} onClick={() => onTeamsChange(toggleFavoriteTeam(team, teams, visibleCatalog, sports))} className={`flex min-h-12 items-center gap-2 rounded-xl border p-2 text-left text-[11px] font-semibold transition ${selected ? 'border-lime-400/40 bg-lime-400/10 text-lime-200' : 'border-white/[.07] bg-white/[.02] text-zinc-300 hover:border-white/20'}`}><SafeImage src={team.logo} alt="" className="size-7 shrink-0 object-contain"/><span className="min-w-0 flex-1 leading-4">{team.name}</span>{selected && <Check size={13} className="shrink-0"/>}</button>
        })}
      </div>
      {sport !== 'mlb' && visibleCatalog.every(team => team.sport !== sport) && <p className="mt-2 text-xs text-zinc-400">{catalogError ? <>Teams could not be loaded. <button type="button" className="text-lime-300 underline" onClick={() => setAttempt(value => value + 1)}>Try again</button></> : 'Loading teams…'}</p>}
    </section>
    {onPlayersChange && <section aria-label="Favorite players">
      <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-bold text-zinc-400">Favorite {sport.toUpperCase()} players</h3><span className="text-[10px] text-zinc-500">{selectedPlayers.length}/{FAVORITE_PLAYERS_PER_SPORT}</span></div>
      {selectedPlayers.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{selectedPlayers.map(player => {
        const artwork = favoritePlayerImages(player)
        return <span key={favoritePlayerKey(player)} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1.5 pr-1"><PlayerAvatar headshot={artwork.headshot} teamLogo={artwork.logo} teamAbbr={player.team} sport={favoritePlayerSport(player)} name={player.name} size={28}/><span className="text-xs font-semibold text-white">{player.name}</span><button type="button" className="grid size-8 place-items-center rounded-full text-zinc-400 hover:bg-red-400/10 hover:text-red-300" aria-label={`Remove ${player.name}`} onClick={() => onPlayersChange((players ?? []).filter(item => favoritePlayerKey(item) !== favoritePlayerKey(player)))}><X size={13}/></button></span>
      })}</div>}
      <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-3.5 text-zinc-500"/><input value={query} onChange={event => changeQuery(event.target.value)} aria-label={`Search favorite ${sport.toUpperCase()} players`} placeholder={`Search ${sport.toUpperCase()} players…`} maxLength={64} disabled={selectedPlayers.length >= FAVORITE_PLAYERS_PER_SPORT} className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-9 pr-3 text-sm text-white outline-none transition focus:border-lime-400/50 disabled:opacity-50"/></div>
      {query.trim().length >= 2 && <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/30" aria-live="polite">
        {searching ? <p className="flex items-center gap-2 p-3 text-xs text-zinc-400"><Loader2 size={14} className="animate-spin"/>Searching…</p> : searchError ? <p className="p-3 text-xs text-zinc-400">Search is unavailable. Try again shortly.</p> : !results.length ? <p className="p-3 text-xs text-zinc-400">No players found.</p> : results.map(player => {
          const artwork = favoritePlayerImages(player), selected = (players ?? []).some(item => favoritePlayerKey(item) === favoritePlayerKey(player))
          return <button key={favoritePlayerKey(player)} type="button" disabled={selected} onClick={() => addPlayer(player)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/5 disabled:opacity-50"><PlayerAvatar headshot={artwork.headshot} teamLogo={artwork.logo} teamAbbr={player.team} sport={favoritePlayerSport(player)} name={player.name} size={32}/><span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{player.name}</span>{selected && <Check size={15} className="text-lime-300"/>}</button>
        })}
      </div>}
    </section>}
  </div>
}
