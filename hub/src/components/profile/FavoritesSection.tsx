import Link from 'next/link'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { SafeImage } from '@/components/ui/SafeImage'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasNbaAccess } from '@/lib/nbaAccessPolicy'
import { getFavoriteCatalog } from '@/lib/favoriteCatalog'
import { MLB_FAVORITE_TEAMS, favoritePlayerHref, favoritePlayerImages, favoritePlayerKey, favoritePlayerSport, normalizeFavoritePlayers, normalizeFavoriteTeams, resolveFavoriteTeam } from '@/lib/sportFavorites'

export async function FavoritesSection({ teams, players, sports = [] }: { teams: string[]; players: unknown; sports?: string[] }) {
  if (!teams.length && !normalizeFavoritePlayers(players).length) return null
  let allowNba = false
  if (teams.some(key => key.startsWith('NBA:')) || normalizeFavoritePlayers(players).some(player => favoritePlayerSport(player) === 'nba')) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: viewer } = user ? await createAdminClient().from('users').select('account_type,tier,discord_advanced_claimed,admin_granted_tier').eq('id', user.id).maybeSingle() : { data: null }
    allowNba = hasNbaAccess(viewer)
  }
  const catalog = await getFavoriteCatalog(allowNba).catch(() => MLB_FAVORITE_TEAMS)
  const visibleTeams = [...new Map(normalizeFavoriteTeams(teams, allowNba).flatMap(key => { const team = resolveFavoriteTeam(key, catalog, sports); return team ? [[team.key, team] as const] : [] })).values()]
  const visiblePlayers = normalizeFavoritePlayers(players, allowNba)
  if (!visibleTeams.length && !visiblePlayers.length) return null
  return <section className="mx-4 my-5 space-y-6 overflow-hidden rounded-[22px] border border-white/[.08] bg-white/[.018] p-4 sm:mx-6 sm:p-5">
    {visibleTeams.length > 0 && <div><h2 className="mb-3 text-[10px] font-black uppercase tracking-[.18em] text-lime-300">Favorite teams</h2><div className="flex flex-wrap gap-2">{visibleTeams.map(team => {
      const className = 'flex items-center gap-2 rounded-xl border border-white/[.08] bg-black/30 py-2 pl-2 pr-3 transition duration-200 hover:-translate-y-px hover:border-lime-400/25 hover:bg-lime-400/[.045]'
      const content = <><SafeImage src={team.logo} alt="" className="size-8 shrink-0 object-contain"/><span className="text-xs font-bold text-white">{team.name}</span></>
      return team.href ? <Link key={team.key} href={team.href} className={className}>{content}</Link> : <span key={team.key} className={className}>{content}</span>
    })}</div></div>}
    {visiblePlayers.length > 0 && <div><h2 className="mb-3 text-[10px] font-black uppercase tracking-[.18em] text-lime-300">Favorite players</h2><div className="flex flex-wrap gap-3">{visiblePlayers.map(player => {
      const artwork = favoritePlayerImages(player), sport = favoritePlayerSport(player)
      return <Link key={favoritePlayerKey(player)} href={favoritePlayerHref(player)} className="flex min-w-[168px] items-center gap-2.5 rounded-xl border border-white/[.08] bg-black/30 px-3 py-2.5 transition duration-200 hover:-translate-y-0.5 hover:border-lime-400/35 hover:bg-lime-400/[.055]"><PlayerAvatar headshot={artwork.headshot} teamLogo={artwork.logo} teamAbbr={sport === 'mlb' ? player.team : null} name={player.name} size={36}/><span className="min-w-0"><span className="block truncate text-xs font-bold text-white">{player.name}</span><span className="text-[10px] text-zinc-500">{sport.toUpperCase()}</span></span></Link>
    })}</div></div>}
  </section>
}
