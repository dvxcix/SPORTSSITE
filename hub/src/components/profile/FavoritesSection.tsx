import Link from 'next/link'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { SafeImage } from '@/components/ui/SafeImage'

interface FavoritePlayer { mlb_id: number; name: string; team: string }

// Favorite teams are decorative chips (no per-team page exists in this app
// to link to). Favorite players DO link somewhere real — the Dugout's
// existing ?highlight= deep link, same "go see this player" destination
// used from search results and Weather Lab's park-HR history.
export function FavoritesSection({ teams, players }: { teams: string[]; players: FavoritePlayer[] }) {
  if (teams.length === 0 && players.length === 0) return null

  return (
    <section className="mx-4 my-5 space-y-6 overflow-hidden rounded-[22px] border border-white/[.08] bg-[radial-gradient(circle_at_5%_0%,rgba(180,255,77,.07),transparent_38%),rgba(255,255,255,.018)] p-4 shadow-[inset_0_1px_rgba(255,255,255,.04)] sm:mx-6 sm:p-5">
      {teams.length > 0 && (
        <div>
          <h2 className="text-[10px] font-black text-lime-300 uppercase tracking-[.18em] mb-3">Favorite Teams</h2>
          <div className="flex flex-wrap gap-2">
            {teams.map(abbr => {
              const logo = getTeamLogoUrl(abbr)
              return (
                <span key={abbr} className="group flex items-center gap-2 rounded-xl border border-white/[.08] bg-black/30 py-2 pl-2 pr-3 shadow-[inset_0_1px_rgba(255,255,255,.035)] transition duration-200 hover:-translate-y-px hover:border-lime-400/25 hover:bg-lime-400/[.045]">
                  {logo && <SafeImage src={logo} alt={`${abbr} logo`} className="w-7 h-7 object-contain" />}
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
                className="group flex min-w-[168px] items-center gap-2.5 rounded-xl border border-white/[.08] bg-black/30 px-3 py-2.5 shadow-[inset_0_1px_rgba(255,255,255,.035)] transition duration-200 hover:-translate-y-0.5 hover:border-lime-400/35 hover:bg-lime-400/[.055] hover:shadow-[0_12px_30px_rgba(0,0,0,.2)]">
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
