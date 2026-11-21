import Link from 'next/link'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { SafeImage } from '@/components/ui/SafeImage'
import { getFavoriteCatalog } from '@/lib/favoriteCatalog'
import type { CSSProperties } from 'react'
import { sportTeamColors } from '@/lib/sportTeamArtwork'
import { MLB_FAVORITE_TEAMS, favoritePlayerHref, favoritePlayerImages, favoritePlayerKey, favoritePlayerSport, normalizeFavoritePlayers, normalizeFavoriteTeams, resolveFavoriteTeam, type FavoriteTeam } from '@/lib/sportFavorites'

export async function FavoritesSection({ teams, players, sports = [], mlbAccess = false, catalog: suppliedCatalog }: { teams: string[]; players: unknown; sports?: string[]; mlbAccess?: boolean; catalog?: FavoriteTeam[] }) {
  if (!teams.length && !normalizeFavoritePlayers(players).length) return null
  const allowNba = true
  const catalog = suppliedCatalog ?? await getFavoriteCatalog(allowNba).catch(() => MLB_FAVORITE_TEAMS)
  const visibleTeams = [...new Map(normalizeFavoriteTeams(teams, allowNba).flatMap(key => { const team = resolveFavoriteTeam(key, catalog, sports); return team && (mlbAccess || team.sport !== 'mlb') ? [[team.key, team] as const] : [] })).values()]
  const visiblePlayers = normalizeFavoritePlayers(players, allowNba).filter(player => mlbAccess || favoritePlayerSport(player) !== 'mlb')
  if (!visibleTeams.length && !visiblePlayers.length) return null
  return <section className="ss-member-favorites mx-4 my-5 space-y-6 overflow-hidden rounded-xl border border-[var(--border)] p-4 sm:mx-6 sm:p-5">
    {visibleTeams.length > 0 && <div><h2 className="mb-3 text-sm font-semibold text-[var(--text-1)]">Favorite teams</h2><div className="flex flex-wrap gap-2">{visibleTeams.map(team => {
      const className = 'ss-favorite-team'
      const colors = sportTeamColors(team.sport, team.abbr)
      const style = colors ? { '--team-primary': colors[0], '--team-secondary': colors[1] } as CSSProperties : undefined
      const content = <><SafeImage src={team.logo} alt="" className="size-8 shrink-0 object-contain"/><span className="text-xs font-bold text-[var(--text-1)]">{team.name}</span></>
      return team.href ? <Link key={team.key} href={team.href} className={className} style={style}>{content}</Link> : <span key={team.key} className={className} style={style}>{content}</span>
    })}</div></div>}
    {visiblePlayers.length > 0 && <div><h2 className="mb-3 text-sm font-semibold text-[var(--text-1)]">Favorite players</h2><div className="flex flex-wrap gap-3">{visiblePlayers.map(player => {
      const artwork = favoritePlayerImages(player), sport = favoritePlayerSport(player)
      return <Link key={favoritePlayerKey(player)} href={favoritePlayerHref(player)} className="flex min-w-[168px] items-center gap-2.5 rounded-xl border border-[rgba(var(--line-rgb),0.08)] bg-[var(--overlay)] px-3 py-2.5 transition duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_5.5%,transparent)]"><PlayerAvatar playerId={'player_id' in player ? player.player_id : null} headshot={artwork.headshot} teamLogo={artwork.logo} teamAbbr={player.team} sport={sport} name={player.name} size={36}/><span className="min-w-0"><span className="block truncate text-xs font-bold text-[var(--text-1)]">{player.name}</span><span className="text-xs text-[var(--text-2)]">{sport.toUpperCase()}</span></span></Link>
    })}</div></div>}
  </section>
}
