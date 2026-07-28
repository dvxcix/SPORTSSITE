import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

export const revalidate = 0

// Same "not linked from nav yet, internal-only" posture as /players/[id] —
// this is the data-framework foundation for the 2026-27 NFL season, not a
// finished feature. It IS wired into global search (that's the whole point
// of building it now), just not in the Sidebar.
function currentNflSeason(): number {
  const now = new Date()
  const year = now.getUTCFullYear()
  return now.getUTCMonth() < 2 ? year - 1 : year
}

async function getTeamData(abbr: string) {
  const admin = createAdminClient()
  const { data: team } = await admin.from('nfl_teams').select('*').eq('team_abbr', abbr.toUpperCase()).maybeSingle()
  if (!team) return null
  const { data: roster } = await admin
    .from('nfl_players')
    .select('gsis_id, display_name, position, position_group, jersey_number, headshot, status, years_of_experience, college_name')
    .eq('latest_team', team.team_abbr)
    .gte('last_season', currentNflSeason())
    .order('position_group', { ascending: true })
    .order('display_name', { ascending: true })
  return { team, roster: roster ?? [] }
}

export async function generateMetadata({ params }: { params: Promise<{ abbr: string }> }): Promise<Metadata> {
  const { abbr } = await params
  const admin = createAdminClient()
  const { data } = await admin.from('nfl_teams').select('team_name').eq('team_abbr', abbr.toUpperCase()).maybeSingle()
  return { title: data?.team_name ? `${data.team_name} — SlipSurge` : 'Team — SlipSurge' }
}

export default async function NflTeamPage({ params }: { params: Promise<{ abbr: string }> }) {
  const { abbr } = await params
  const data = await getTeamData(abbr)
  if (!data) notFound()
  const { team, roster } = data

  const groups = new Map<string, typeof roster>()
  for (const p of roster) {
    const key = p.position_group || 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div
        className="rounded-xl p-6 mb-6 flex items-center gap-4"
        style={{ background: `linear-gradient(135deg, ${team.team_color ?? '#111'}, #06070a)` }}
      >
        {team.team_logo_espn && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.team_logo_espn} alt={team.team_name} width={72} height={72} style={{ objectFit: 'contain' }} />
        )}
        <div>
          <h1 className="text-2xl font-black text-white">{team.team_name}</h1>
          <p className="text-sm text-zinc-300">{team.team_conf} {team.team_division}</p>
        </div>
      </div>

      <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Roster ({roster.length})</h2>
      {roster.length === 0 && (
        <p className="text-sm text-zinc-500">No current roster data synced yet.</p>
      )}
      <div className="space-y-6">
        {Array.from(groups.entries()).map(([group, players]) => (
          <div key={group}>
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">{group}</h3>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
              {players.map(p => (
                <Link
                  key={p.gsis_id}
                  href={`/nfl/players/${p.gsis_id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 transition-colors"
                >
                  {p.headshot ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.headshot} alt={p.display_name} width={32} height={32} className="rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-500">
                      {p.position || '—'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{p.display_name}</p>
                    <p className="text-xs text-zinc-500">{p.position}{p.jersey_number != null ? ` · #${p.jersey_number}` : ''}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
