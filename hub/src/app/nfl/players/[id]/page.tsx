import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

export const revalidate = 0

async function getPlayerData(id: string) {
  const admin = createAdminClient()
  const { data: player } = await admin.from('nfl_players').select('*').eq('gsis_id', id).maybeSingle()
  if (!player) return null
  const { data: team } = player.latest_team
    ? await admin.from('nfl_teams').select('team_abbr, team_name, team_color, team_logo_espn').eq('team_abbr', player.latest_team).maybeSingle()
    : { data: null }
  return { player, team }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const admin = createAdminClient()
  const { data } = await admin.from('nfl_players').select('display_name').eq('gsis_id', id).maybeSingle()
  return { title: data?.display_name ? `${data.display_name} — SlipSurge` : 'Player — SlipSurge' }
}

const bioRow = (label: string, value: React.ReactNode) =>
  value != null && value !== '' ? (
    <div className="flex justify-between text-sm py-1.5 border-b border-zinc-800 last:border-0">
      <span className="text-zinc-500">{label}</span>
      <span className="text-white font-semibold">{value}</span>
    </div>
  ) : null

export default async function NflPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getPlayerData(id)
  if (!data) notFound()
  const { player, team } = data

  const heightStr = player.height ? `${Math.floor(player.height / 12)}'${player.height % 12}"` : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div
        className="rounded-xl p-6 mb-6 flex items-center gap-4"
        style={{ background: `linear-gradient(135deg, ${team?.team_color ?? '#111'}, #06070a)` }}
      >
        {player.headshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.headshot} alt={player.display_name} width={88} height={88} className="rounded-full object-cover" />
        ) : (
          <div className="w-[88px] h-[88px] rounded-full bg-zinc-800 flex items-center justify-center text-2xl text-zinc-500">
            {player.position || '—'}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-black text-white">{player.display_name}</h1>
          <p className="text-sm text-zinc-300">
            {player.position}
            {player.jersey_number != null ? ` · #${player.jersey_number}` : ''}
            {team && <> · <Link href={`/nfl/teams/${team.team_abbr}`} className="underline hover:text-white">{team.team_name}</Link></>}
          </p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Bio</h2>
        {bioRow('Status', player.status)}
        {bioRow('Experience', player.years_of_experience != null ? `${player.years_of_experience} yrs` : null)}
        {bioRow('Height / Weight', heightStr && player.weight ? `${heightStr}, ${player.weight} lbs` : null)}
        {bioRow('College', player.college_name)}
        {bioRow('Rookie Season', player.rookie_season)}
        {bioRow('Draft', player.draft_year ? `${player.draft_year}, Round ${player.draft_round ?? '—'}, Pick ${player.draft_pick ?? '—'} (${player.draft_team ?? '—'})` : null)}
      </div>
    </div>
  )
}
