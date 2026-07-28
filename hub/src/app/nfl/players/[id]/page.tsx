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

  const [{ data: gameLog }, { data: ngsPassing }, { data: ngsReceiving }, { data: ngsRushing }] = await Promise.all([
    admin.from('nfl_player_stats').select('*').eq('player_id', id).order('season', { ascending: false }).order('week', { ascending: false }),
    admin.from('nfl_ngs_passing').select('*').eq('player_gsis_id', id).order('season', { ascending: false }).order('week', { ascending: false }).limit(5),
    admin.from('nfl_ngs_receiving').select('*').eq('player_gsis_id', id).order('season', { ascending: false }).order('week', { ascending: false }).limit(5),
    admin.from('nfl_ngs_rushing').select('*').eq('player_gsis_id', id).order('season', { ascending: false }).order('week', { ascending: false }).limit(5),
  ])

  return {
    player,
    team,
    gameLog: gameLog ?? [],
    ngsPassing: ngsPassing ?? [],
    ngsReceiving: ngsReceiving ?? [],
    ngsRushing: ngsRushing ?? [],
  }
}

type StatRow = Record<string, unknown>

const SUM_FIELDS = [
  'completions', 'attempts', 'passing_yards', 'passing_tds', 'interceptions',
  'carries', 'rushing_yards', 'rushing_tds',
  'receptions', 'targets', 'receiving_yards', 'receiving_tds',
] as const

function sumBySeason(gameLog: StatRow[]): StatRow[] {
  const bySeason = new Map<string, StatRow>()
  for (const row of gameLog) {
    if (row.season_type !== 'REG') continue
    const key = `${row.season}`
    const acc = bySeason.get(key) ?? { season: row.season, games: 0 }
    acc.games = (acc.games as number) + 1
    for (const f of SUM_FIELDS) acc[f] = ((acc[f] as number) ?? 0) + ((row[f] as number) ?? 0)
    bySeason.set(key, acc)
  }
  return Array.from(bySeason.values()).sort((a, b) => (b.season as number) - (a.season as number))
}

const num = (v: unknown, digits = 0): string => (typeof v === 'number' ? v.toFixed(digits) : '—')

function statCell(label: string, value: unknown) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-sm font-bold text-white tabular-nums">{typeof value === 'number' ? value : '—'}</div>
    </div>
  )
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
  const { player, team, gameLog, ngsPassing, ngsReceiving, ngsRushing } = data

  const heightStr = player.height ? `${Math.floor(player.height / 12)}'${player.height % 12}"` : null

  const isQb = player.position === 'QB'
  const isRb = player.position === 'RB' || player.position === 'FB'
  const seasonStats = sumBySeason(gameLog as StatRow[])
  const recentGames = (gameLog as StatRow[]).slice(0, 5)
  const ngsRows: StatRow[] = isQb ? ngsPassing : isRb ? ngsRushing : ngsReceiving

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
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

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Bio</h2>
        {bioRow('Status', player.status)}
        {bioRow('Experience', player.years_of_experience != null ? `${player.years_of_experience} yrs` : null)}
        {bioRow('Height / Weight', heightStr && player.weight ? `${heightStr}, ${player.weight} lbs` : null)}
        {bioRow('College', player.college_name)}
        {bioRow('Rookie Season', player.rookie_season)}
        {bioRow('Draft', player.draft_year ? `${player.draft_year}, Round ${player.draft_round ?? '—'}, Pick ${player.draft_pick ?? '—'} (${player.draft_team ?? '—'})` : null)}
      </div>

      {seasonStats.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6 overflow-x-auto">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Season Stats</h2>
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-zinc-500 text-xs uppercase text-left">
                <th className="pb-2 font-semibold">Season</th>
                <th className="pb-2 font-semibold text-center">G</th>
                {isQb ? (
                  <>
                    <th className="pb-2 font-semibold text-center">Comp/Att</th>
                    <th className="pb-2 font-semibold text-center">Yds</th>
                    <th className="pb-2 font-semibold text-center">TD</th>
                    <th className="pb-2 font-semibold text-center">INT</th>
                  </>
                ) : isRb ? (
                  <>
                    <th className="pb-2 font-semibold text-center">Car</th>
                    <th className="pb-2 font-semibold text-center">Rush Yds</th>
                    <th className="pb-2 font-semibold text-center">Rush TD</th>
                    <th className="pb-2 font-semibold text-center">Rec</th>
                    <th className="pb-2 font-semibold text-center">Rec Yds</th>
                  </>
                ) : (
                  <>
                    <th className="pb-2 font-semibold text-center">Rec</th>
                    <th className="pb-2 font-semibold text-center">Tgt</th>
                    <th className="pb-2 font-semibold text-center">Rec Yds</th>
                    <th className="pb-2 font-semibold text-center">Rec TD</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {seasonStats.map(row => (
                <tr key={String(row.season)} className="border-t border-zinc-800">
                  <td className="py-2 text-white font-semibold">{String(row.season)}</td>
                  <td className="py-2 text-center text-zinc-300 tabular-nums">{String(row.games)}</td>
                  {isQb ? (
                    <>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.completions)}/{num(row.attempts)}</td>
                      <td className="py-2 text-center text-white font-semibold tabular-nums">{num(row.passing_yards)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.passing_tds)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.interceptions)}</td>
                    </>
                  ) : isRb ? (
                    <>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.carries)}</td>
                      <td className="py-2 text-center text-white font-semibold tabular-nums">{num(row.rushing_yards)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.rushing_tds)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.receptions)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.receiving_yards)}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.receptions)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.targets)}</td>
                      <td className="py-2 text-center text-white font-semibold tabular-nums">{num(row.receiving_yards)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.receiving_tds)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recentGames.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6 overflow-x-auto">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Recent Games</h2>
          <div className="flex gap-4 overflow-x-auto">
            {recentGames.map((g, i) => (
              <div key={i} className="flex-shrink-0 bg-zinc-950 border border-zinc-800 rounded-lg p-3 min-w-[140px]">
                <div className="text-[10px] text-zinc-500 mb-2">
                  {String(g.season)} Wk {String(g.week)} · {String(g.opponent_team ?? '—')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {isQb ? (
                    <>
                      {statCell('Yds', g.passing_yards as number)}
                      {statCell('TD', g.passing_tds as number)}
                    </>
                  ) : isRb ? (
                    <>
                      {statCell('Rush Yds', g.rushing_yards as number)}
                      {statCell('Rec Yds', g.receiving_yards as number)}
                    </>
                  ) : (
                    <>
                      {statCell('Rec', g.receptions as number)}
                      {statCell('Yds', g.receiving_yards as number)}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ngsRows.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 overflow-x-auto">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Next Gen Stats — Recent Games</h2>
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-zinc-500 text-xs uppercase text-left">
                <th className="pb-2 font-semibold">Season</th>
                <th className="pb-2 font-semibold text-center">Wk</th>
                {isQb ? (
                  <>
                    <th className="pb-2 font-semibold text-center">Time to Throw</th>
                    <th className="pb-2 font-semibold text-center">CPOE</th>
                    <th className="pb-2 font-semibold text-center">Air Yds/Att</th>
                  </>
                ) : isRb ? (
                  <>
                    <th className="pb-2 font-semibold text-center">Efficiency</th>
                    <th className="pb-2 font-semibold text-center">RYOE</th>
                    <th className="pb-2 font-semibold text-center">RYOE/Att</th>
                  </>
                ) : (
                  <>
                    <th className="pb-2 font-semibold text-center">Avg Sep</th>
                    <th className="pb-2 font-semibold text-center">Avg Cushion</th>
                    <th className="pb-2 font-semibold text-center">YAC+/-</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {ngsRows.map((row, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="py-2 text-white font-semibold">{String(row.season)}</td>
                  <td className="py-2 text-center text-zinc-300 tabular-nums">{String(row.week)}</td>
                  {isQb ? (
                    <>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.avg_time_to_throw, 2)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.completion_percentage_above_expectation, 1)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.avg_intended_air_yards, 1)}</td>
                    </>
                  ) : isRb ? (
                    <>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.efficiency, 2)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.rush_yards_over_expected, 1)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.rush_yards_over_expected_per_att, 2)}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.avg_separation, 2)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.avg_cushion, 2)}</td>
                      <td className="py-2 text-center text-zinc-300 tabular-nums">{num(row.avg_yac_above_expectation, 2)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
