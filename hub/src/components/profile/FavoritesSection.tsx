import Link from 'next/link'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { mlbHeadshot } from '@/lib/mlb-api'

interface FavoritePlayer { mlb_id: number; name: string; team: string }

// Favorite teams are decorative chips (no per-team page exists in this app
// to link to). Favorite players DO link somewhere real — the Dugout's
// existing ?highlight= deep link, same "go see this player" destination
// used from search results and Weather Lab's park-HR history.
export function FavoritesSection({ teams, players }: { teams: string[]; players: FavoritePlayer[] }) {
  if (teams.length === 0 && players.length === 0) return null

  return (
    <div className="px-4 py-4 border-t border-zinc-800 space-y-3">
      {teams.length > 0 && (
        <div>
          <h2 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">Favorite Teams</h2>
          <div className="flex flex-wrap gap-2">
            {teams.map(abbr => {
              const logo = getTeamLogoUrl(abbr)
              return (
                <span key={abbr} className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-full pl-1.5 pr-3 py-1">
                  {logo && <img src={logo} alt={abbr} className="w-5 h-5 object-contain" />}
                  <span className="text-xs font-bold text-white">{abbr}</span>
                </span>
              )
            })}
          </div>
        </div>
      )}
      {players.length > 0 && (
        <div>
          <h2 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">Favorite Players</h2>
          <div className="flex flex-wrap gap-3">
            {players.map(p => (
              <Link key={p.mlb_id} href={`/dugout?highlight=${p.mlb_id}`}
                className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-2 hover:border-zinc-600 transition-colors">
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
    </div>
  )
}
