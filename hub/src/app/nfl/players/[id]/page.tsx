import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { NflTeamLogo } from '@/components/shared/NflTeamLogo'

export const revalidate = 0

async function getPlayerData(id: string) {
  const admin = createAdminClient()
  const { data: player } = await admin.from('nfl_players').select('*').eq('gsis_id', id).maybeSingle()
  if (!player) return null
  const { data: team } = player.latest_team
    ? await admin.from('nfl_teams').select('team_abbr, team_name, team_color, team_logo_espn').eq('team_abbr', player.latest_team).maybeSingle()
    : { data: null }

  const [{ data: gameLog }, { data: ngsPassing }, { data: ngsReceiving }, { data: ngsRushing }, { data: allTeams }] = await Promise.all([
    admin.from('nfl_player_stats').select('*').eq('player_id', id).order('season', { ascending: false }).order('week', { ascending: false }),
    admin.from('nfl_ngs_passing').select('*').eq('player_gsis_id', id).order('season', { ascending: false }).order('week', { ascending: false }).limit(5),
    admin.from('nfl_ngs_receiving').select('*').eq('player_gsis_id', id).order('season', { ascending: false }).order('week', { ascending: false }).limit(5),
    admin.from('nfl_ngs_rushing').select('*').eq('player_gsis_id', id).order('season', { ascending: false }).order('week', { ascending: false }).limit(5),
    admin.from('nfl_teams').select('team_abbr, team_logo_espn'),
  ])
  const teamLogos: Record<string, string | null> = {}
  for (const t of allTeams ?? []) teamLogos[t.team_abbr] = t.team_logo_espn

  // week=0 rows are a season-total stopgap fill (see sumBySeason) with no
  // games-played count of their own (nfl_player_stats has no such column) —
  // backfill a real count from nfl_pbp, which already has this player's
  // actual per-game appearances as passer/rusher/receiver.
  const aggregateRows = (gameLog ?? []).filter(r => r.week === 0)
  if (aggregateRows.length > 0) {
    await Promise.all(aggregateRows.map(async row => {
      const { data: plays } = await admin
        .from('nfl_pbp')
        .select('game_id')
        .eq('season', row.season)
        .eq('season_type', 'REG')
        .or(`passer_player_id.eq.${id},rusher_player_id.eq.${id},receiver_player_id.eq.${id}`)
      row.games = new Set((plays ?? []).map(p => p.game_id)).size
    }))
  }

  // Opponent adjustment ("defense vs position") for the player's next
  // scheduled game — nfl_schedule already has the 2026 slate published even
  // pre-season, so this resolves to a real upcoming opponent as soon as
  // there is one.
  let opponent: { team_abbr: string; games: number; season: number } | null = null
  let dvpRows: Record<string, unknown>[] = []
  if (player.latest_team) {
    const today = new Date().toISOString().slice(0, 10)
    const { data: nextGame } = await admin
      .from('nfl_schedule')
      .select('home_team, away_team, gameday')
      .or(`home_team.eq.${player.latest_team},away_team.eq.${player.latest_team}`)
      .gte('gameday', today)
      .order('gameday', { ascending: true })
      .limit(1)
      .maybeSingle()
    const opponentTeam = nextGame ? (nextGame.home_team === player.latest_team ? nextGame.away_team : nextGame.home_team) : null
    if (opponentTeam && player.position) {
      const { data } = await admin
        .from('nfl_dvp')
        .select('*')
        .eq('opponent_team', opponentTeam)
        .eq('position', player.position)
        .order('season', { ascending: false })
      const latestSeason = data?.[0]?.season as number | undefined
      if (latestSeason != null) {
        dvpRows = (data ?? []).filter(r => r.season === latestSeason)
        opponent = { team_abbr: opponentTeam, games: dvpRows[0]?.games as number ?? 0, season: latestSeason }
      }
    }
  }

  return {
    player,
    team,
    gameLog: gameLog ?? [],
    ngsPassing: ngsPassing ?? [],
    ngsReceiving: ngsReceiving ?? [],
    ngsRushing: ngsRushing ?? [],
    opponent,
    dvpRows,
    teamLogos,
  }
}

type StatRow = Record<string, unknown>

const SUM_FIELDS = [
  'completions', 'attempts', 'passing_yards', 'passing_tds', 'interceptions',
  'carries', 'rushing_yards', 'rushing_tds',
  'receptions', 'targets', 'receiving_yards', 'receiving_tds',
] as const

// week=0 rows are a season-total stopgap fill (used for a season nflverse
// hasn't published real weekly data for yet — same week=0 "aggregate" row
// convention nflverse's own NGS files already use), not a real game. Once
// real weekly rows exist for that season, those are summed and the
// stopgap row is ignored entirely, so the total never double-counts.
function sumBySeason(gameLog: StatRow[]): StatRow[] {
  const bySeason = new Map<number, StatRow[]>()
  for (const row of gameLog) {
    if (row.season_type !== 'REG') continue
    const season = row.season as number
    const rows = bySeason.get(season) ?? []
    rows.push(row)
    bySeason.set(season, rows)
  }
  return Array.from(bySeason.entries()).map(([season, rows]) => {
    const weekly = rows.filter(r => r.week !== 0)
    if (weekly.length > 0) {
      const acc: StatRow = { season, games: weekly.length }
      for (const f of SUM_FIELDS) acc[f] = weekly.reduce((sum, r) => sum + ((r[f] as number) ?? 0), 0)
      return acc
    }
    const aggregate = rows[0]
    return { ...aggregate, season }
  }).sort((a, b) => (b.season as number) - (a.season as number))
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
  const { player, team, gameLog, ngsPassing, ngsReceiving, ngsRushing, opponent, dvpRows, teamLogos } = data

  const heightStr = player.height ? `${Math.floor(player.height / 12)}'${player.height % 12}"` : null

  const isQb = player.position === 'QB'
  const isRb = player.position === 'RB' || player.position === 'FB'
  const seasonStats = sumBySeason(gameLog as StatRow[])
  const recentGames = (gameLog as StatRow[]).filter(r => r.week !== 0).slice(0, 5)
  const ngsRows: StatRow[] = isQb ? ngsPassing : isRb ? ngsRushing : ngsReceiving

  const DVP_LABELS: Record<string, string> = {
    passing_yards: 'Pass Yds', passing_tds: 'Pass TD', interceptions: 'INT', completions: 'Comp', attempts: 'Att',
    rushing_yards: 'Rush Yds', rushing_tds: 'Rush TD', receiving_yards: 'Rec Yds', receiving_tds: 'Rec TD',
    receptions: 'Rec', targets: 'Tgt',
  }
  const dvpByCategory = new Map((dvpRows as StatRow[]).map(r => [r.stat_category as string, r]))

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
          <p className="text-sm text-zinc-300 flex items-center gap-1.5">
            <span>
              {player.position}
              {player.jersey_number != null ? ` · #${player.jersey_number}` : ''}
            </span>
            {team && (
              <>
                <span>·</span>
                <Link href={`/nfl/teams/${team.team_abbr}`} className="inline-flex items-center gap-1.5 hover:text-white">
                  <NflTeamLogo abbr={team.team_abbr} logoUrl={team.team_logo_espn} size={18} />
                  <span className="underline">{team.team_name}</span>
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      {opponent && dvpByCategory.size > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6 overflow-x-auto">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <span>Next Matchup vs</span>
            <NflTeamLogo abbr={opponent.team_abbr} logoUrl={teamLogos[opponent.team_abbr]} size={18} />
            <span className="normal-case text-zinc-600">({opponent.season} defense vs {player.position}, {opponent.games} games)</span>
          </h2>
          <div className="flex gap-4 overflow-x-auto">
            {(isQb
              ? ['passing_yards', 'passing_tds', 'interceptions']
              : isRb
              ? ['rushing_yards', 'rushing_tds', 'receiving_yards', 'receptions']
              : ['receiving_yards', 'receiving_tds', 'receptions', 'targets']
            ).map(cat => {
              const row = dvpByCategory.get(cat)
              if (!row) return null
              const pctDiff = row.pct_diff as number | null
              const favorable = pctDiff != null && pctDiff > 0
              return (
                <div key={cat} className="flex-shrink-0 bg-zinc-950 border border-zinc-800 rounded-lg p-3 min-w-[120px]">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">{DVP_LABELS[cat] ?? cat}</div>
                  <div className="text-sm font-bold text-white tabular-nums">{num(row.avg_allowed, 1)}/gm</div>
                  <div className={`text-xs font-semibold tabular-nums ${pctDiff == null ? 'text-zinc-500' : favorable ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pctDiff != null ? `${pctDiff > 0 ? '+' : ''}${pctDiff.toFixed(1)}% vs avg` : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Bio</h2>
        {bioRow('Status', player.status)}
        {bioRow('Experience', player.years_of_experience != null ? `${player.years_of_experience} yrs` : null)}
        {bioRow('Height / Weight', heightStr && player.weight ? `${heightStr}, ${player.weight} lbs` : null)}
        {bioRow('College', player.college_name)}
        {bioRow('Rookie Season', player.rookie_season)}
        {bioRow('Draft', player.draft_year ? (
          <span className="inline-flex items-center gap-1.5">
            <span>{player.draft_year}, Round {player.draft_round ?? '—'}, Pick {player.draft_pick ?? '—'}</span>
            {player.draft_team && <NflTeamLogo abbr={player.draft_team} logoUrl={teamLogos[player.draft_team]} size={16} />}
          </span>
        ) : null)}
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
                  <td className="py-2 text-center text-zinc-300 tabular-nums">{row.games != null ? String(row.games) : '—'}</td>
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
                <div className="text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
                  <span>{String(g.season)} Wk {String(g.week)}</span>
                  {g.opponent_team ? (
                    <>
                      <span>·</span>
                      <NflTeamLogo abbr={g.opponent_team as string} logoUrl={teamLogos[g.opponent_team as string]} size={14} />
                    </>
                  ) : (
                    <span>· —</span>
                  )}
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
