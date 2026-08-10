import Link from 'next/link'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'

interface FavoritePlayer { mlb_id: number; name: string; team: string }

// Favorite teams are decorative chips (no per-team page exists in this app
// to link to). Favorite players DO link somewhere real — the Dugout's
// existing ?highlight= deep link, same "go see this player" destination
// used from search results and Weather Lab's park-HR history.
export function FavoritesSection({ teams, players }: { teams: string[]; players: FavoritePlayer[] }) {
  if (teams.length === 0 && players.length === 0) return null

  return (
    <section className="mx-4 my-4 space-y-5 rounded-2xl border border-white/[.08] bg-gradient-to-br from-white/[.035] to-transparent p-4 sm:p-5">
      {teams.length > 0 && (
        <div>
          <h2 className="text-[10px] font-black text-lime-300 uppercase tracking-[.18em] mb-3">Favorite Teams</h2>
          <div className="flex flex-wrap gap-2">
            {teams.map(abbr => {
              const logo = getTeamLogoUrl(abbr)
              return (
                <span key={abbr} className="flex items-center gap-2 bg-black/30 border border-white/[.08] rounded-xl pl-2 pr-3 py-2">
                  {logo && <img src={logo} alt={abbr} className="w-7 h-7 object-contain" />}
                  <span className="text-xs font-bold text-white">{abbr}</span>
                </span>
              )
            })}
          </div>
        </div>
      )}
      {players.length > 0 && (
        <div>
          <h2 className="text-[10px] font-black text-lime-300 uppercase tracking-[.18em] mb-3">Favorite Players</h2>
          <div className="flex flex-wrap gap-3">
            {players.map(p => (
              <Link key={p.mlb_id} href={`/players/${p.mlb_id}`}
                className="flex items-center gap-2.5 bg-black/30 border border-white/[.08] rounded-xl px-3 py-2.5 hover:border-lime-400/35 hover:bg-lime-400/[.04] transition-colors">
                <PlayerAvatar headshot={mlbHeadshot(p.mlb_id)} teamLogo={getTeamLogoUrl(p.team)} teamAbbr={p.team} name={p.name} size={32} />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{p.name}</p>
                  <p className="text-[10px] text-zinc-500">{p.team}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
