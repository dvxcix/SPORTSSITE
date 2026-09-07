import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  SidelineGame,
  SidelineLens,
  SidelinePlayer,
  SidelineTeamProfile,
  SidelineWindow,
  SidelineWindowData,
} from './types'

type Row = Record<string, unknown>

const numeric = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const truthy = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true'
const clamp = (value: number, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, value))
const percent = (part: number, total: number) => total > 0 ? Math.round((part / total) * 1000) / 10 : 0
const round1 = (value: number) => Math.round(value * 10) / 10

function emptyTeamProfile(team: SidelineGame['home']): SidelineTeamProfile {
  return {
    team,
    plays: 0,
    passRate: 0,
    neutralPassRate: 0,
    shotgunRate: 0,
    noHuddleRate: 0,
    successRate: 0,
    explosiveRate: 0,
    redZoneTdRate: 0,
    thirdDownRate: 0,
    defenseSuccessAllowed: 0,
    defenseExplosiveAllowed: 0,
  }
}

function profileTeam(team: SidelineGame['home'], rows: Row[]): SidelineTeamProfile {
  const offense = rows.filter(row => row.posteam === team.abbr && (truthy(row.pass_attempt) || truthy(row.rush_attempt)))
  const defense = rows.filter(row => row.defteam === team.abbr && (truthy(row.pass_attempt) || truthy(row.rush_attempt)))
  if (!offense.length && !defense.length) return emptyTeamProfile(team)

  const passPlays = offense.filter(row => truthy(row.pass_attempt) || truthy(row.qb_dropback))
  const neutral = offense.filter(row => numeric(row.qtr) <= 3 && numeric(row.down) <= 2 && Math.abs(numeric(row.score_differential)) <= 7)
  const neutralPass = neutral.filter(row => truthy(row.pass_attempt) || truthy(row.qb_dropback))
  const redZone = offense.filter(row => numeric(row.yardline_100) > 0 && numeric(row.yardline_100) <= 20)
  const redZoneScores = redZone.filter(row => truthy(row.pass_touchdown) || truthy(row.rush_touchdown))
  const thirdDown = offense.filter(row => numeric(row.down) === 3)
  const thirdDownWins = thirdDown.filter(row => truthy(row.success) || numeric(row.yards_gained) >= numeric(row.ydstogo))
  const explosive = offense.filter(row => truthy(row.pass_attempt) ? numeric(row.yards_gained) >= 20 : numeric(row.yards_gained) >= 10)
  const defenseExplosive = defense.filter(row => truthy(row.pass_attempt) ? numeric(row.yards_gained) >= 20 : numeric(row.yards_gained) >= 10)

  return {
    team,
    plays: offense.length,
    passRate: percent(passPlays.length, offense.length),
    neutralPassRate: percent(neutralPass.length, neutral.length),
    shotgunRate: percent(offense.filter(row => truthy(row.shotgun)).length, offense.length),
    noHuddleRate: percent(offense.filter(row => truthy(row.no_huddle)).length, offense.length),
    successRate: percent(offense.filter(row => truthy(row.success)).length, offense.length),
    explosiveRate: percent(explosive.length, offense.length),
    redZoneTdRate: percent(redZoneScores.length, redZone.length),
    thirdDownRate: percent(thirdDownWins.length, thirdDown.length),
    defenseSuccessAllowed: percent(defense.filter(row => truthy(row.success)).length, defense.length),
    defenseExplosiveAllowed: percent(defenseExplosive.length, defense.length),
  }
}

type PlayerAccumulator = {
  id: string
  name: string
  team: string
  position: string
  games: Set<number>
  targets: number
  receptions: number
  receivingYards: number
  carries: number
  rushingYards: number
  passAttempts: number
  completions: number
  passingYards: number
  touchdowns: number
  airYardsWeight: number
  airYardsTotal: number
  airShareWeight: number
  airShareTotal: number
  separationWeight: number
  separationTotal: number
  yacWeight: number
  yacTotal: number
  rushOeWeight: number
  rushOeTotal: number
  cpoeWeight: number
  cpoeTotal: number
  timeToThrowWeight: number
  timeToThrowTotal: number
  redZoneLooks: number
  goalLineLooks: number
  redZoneScores: number
  explosivePlays: number
}

function ensurePlayer(map: Map<string, PlayerAccumulator>, row: Row, fallbackPosition: string) {
  const id = String(row.player_gsis_id ?? row.passer_player_id ?? row.receiver_player_id ?? row.rusher_player_id ?? '')
  if (!id) return null
  const existing = map.get(id)
  if (existing) return existing
  const created: PlayerAccumulator = {
    id,
    name: String(row.player_display_name ?? row.player_short_name ?? row.passer_player_name ?? row.receiver_player_name ?? row.rusher_player_name ?? 'Unknown player'),
    team: String(row.team_abbr ?? row.posteam ?? ''),
    position: String(row.player_position ?? fallbackPosition),
    games: new Set<number>(),
    targets: 0,
    receptions: 0,
    receivingYards: 0,
    carries: 0,
    rushingYards: 0,
    passAttempts: 0,
    completions: 0,
    passingYards: 0,
    touchdowns: 0,
    airYardsWeight: 0,
    airYardsTotal: 0,
    airShareWeight: 0,
    airShareTotal: 0,
    separationWeight: 0,
    separationTotal: 0,
    yacWeight: 0,
    yacTotal: 0,
    rushOeWeight: 0,
    rushOeTotal: 0,
    cpoeWeight: 0,
    cpoeTotal: 0,
    timeToThrowWeight: 0,
    timeToThrowTotal: 0,
    redZoneLooks: 0,
    goalLineLooks: 0,
    redZoneScores: 0,
    explosivePlays: 0,
  }
  map.set(id, created)
  return created
}

function addWeighted(player: PlayerAccumulator, totalKey: keyof PlayerAccumulator, weightKey: keyof PlayerAccumulator, value: unknown, weight: number) {
  if (!weight) return
  ;(player[totalKey] as number) += numeric(value) * weight
  ;(player[weightKey] as number) += weight
}

function buildPlayers(
  receiving: Row[],
  rushing: Row[],
  passing: Row[],
  pbp: Row[],
  teams: SidelineGame['home'][],
  bio: Map<string, { headshot: string | null; jersey: number | null; position: string | null }>,
): SidelinePlayer[] {
  const playerMap = new Map<string, PlayerAccumulator>()
  const teamTargets = new Map<string, number>()
  const teamCarries = new Map<string, number>()
  const teamPassAttempts = new Map<string, number>()

  for (const row of receiving) {
    const player = ensurePlayer(playerMap, row, 'WR')
    if (!player) continue
    const targets = numeric(row.targets)
    const receptions = numeric(row.receptions)
    const week = numeric(row.week)
    if (week > 0) player.games.add(week)
    player.targets += targets
    player.receptions += receptions
    player.receivingYards += numeric(row.yards)
    player.touchdowns += numeric(row.rec_touchdowns)
    addWeighted(player, 'airYardsTotal', 'airYardsWeight', row.avg_intended_air_yards, targets)
    addWeighted(player, 'airShareTotal', 'airShareWeight', row.percent_share_of_intended_air_yards, targets)
    addWeighted(player, 'separationTotal', 'separationWeight', row.avg_separation, targets)
    addWeighted(player, 'yacTotal', 'yacWeight', row.avg_yac_above_expectation, receptions || targets)
    teamTargets.set(player.team, (teamTargets.get(player.team) ?? 0) + targets)
  }

  for (const row of rushing) {
    const player = ensurePlayer(playerMap, row, 'RB')
    if (!player) continue
    const carries = numeric(row.rush_attempts)
    const week = numeric(row.week)
    if (week > 0) player.games.add(week)
    player.carries += carries
    player.rushingYards += numeric(row.rush_yards)
    player.touchdowns += numeric(row.rush_touchdowns)
    addWeighted(player, 'rushOeTotal', 'rushOeWeight', row.rush_yards_over_expected_per_att, carries)
    teamCarries.set(player.team, (teamCarries.get(player.team) ?? 0) + carries)
  }

  for (const row of passing) {
    const player = ensurePlayer(playerMap, row, 'QB')
    if (!player) continue
    const attempts = numeric(row.attempts)
    const week = numeric(row.week)
    if (week > 0) player.games.add(week)
    player.passAttempts += attempts
    player.completions += numeric(row.completions)
    player.passingYards += numeric(row.pass_yards)
    player.touchdowns += numeric(row.pass_touchdowns)
    addWeighted(player, 'airYardsTotal', 'airYardsWeight', row.avg_intended_air_yards, attempts)
    addWeighted(player, 'cpoeTotal', 'cpoeWeight', row.completion_percentage_above_expectation, attempts)
    addWeighted(player, 'timeToThrowTotal', 'timeToThrowWeight', row.avg_time_to_throw, attempts)
    teamPassAttempts.set(player.team, (teamPassAttempts.get(player.team) ?? 0) + attempts)
  }

  const byName = new Map(Array.from(playerMap.values()).map(player => [player.name.toLowerCase(), player]))
  for (const row of pbp) {
    const isPass = truthy(row.pass_attempt)
    const isRush = truthy(row.rush_attempt)
    const isRedZone = numeric(row.yardline_100) > 0 && numeric(row.yardline_100) <= 20
    const isGoalLine = numeric(row.yardline_100) > 0 && numeric(row.yardline_100) <= 5
    const id = String(row.receiver_player_id ?? row.rusher_player_id ?? '')
    const name = String(row.receiver_player_name ?? row.rusher_player_name ?? '').toLowerCase()
    const player = playerMap.get(id) ?? byName.get(name)
    if (!player) continue
    if (isRedZone) player.redZoneLooks += 1
    if (isGoalLine) player.goalLineLooks += 1
    if (isRedZone && (truthy(row.pass_touchdown) || truthy(row.rush_touchdown))) player.redZoneScores += 1
    if ((isPass && numeric(row.yards_gained) >= 20) || (isRush && numeric(row.yards_gained) >= 10)) player.explosivePlays += 1
  }

  return Array.from(playerMap.values())
    .filter(player => teams.some(team => team.abbr === player.team) && player.targets + player.carries + player.passAttempts > 0)
    .map(player => {
      const playerBio = bio.get(player.id)
      const touches = player.targets + player.carries
      const targetShare = percent(player.targets, teamTargets.get(player.team) ?? 0)
      const carryShare = percent(player.carries, teamCarries.get(player.team) ?? 0)
      const passShare = percent(player.passAttempts, teamPassAttempts.get(player.team) ?? 0)
      const airYards = player.airYardsWeight ? player.airYardsTotal / player.airYardsWeight : 0
      const airYardsShare = player.airShareWeight ? player.airShareTotal / player.airShareWeight : 0
      const separation = player.separationWeight ? player.separationTotal / player.separationWeight : 0
      const yacAboveExpected = player.yacWeight ? player.yacTotal / player.yacWeight : 0
      const rushOverExpected = player.rushOeWeight ? player.rushOeTotal / player.rushOeWeight : 0
      const cpoe = player.cpoeWeight ? player.cpoeTotal / player.cpoeWeight : 0
      const timeToThrow = player.timeToThrowWeight ? player.timeToThrowTotal / player.timeToThrowWeight : 0
      const isQuarterback = player.position === 'QB' || player.passAttempts > touches
      const volume = clamp(isQuarterback ? 34 + passShare * .62 : targetShare * 1.5 + carryShare * .9)
      const geometry = clamp(isQuarterback
        ? 38 + airYards * 2.2 + Math.max(-5, cpoe) * 1.4
        : 32 + airYards * 2.35 + separation * 5.2 + Math.max(0, rushOverExpected) * 11)
      const redZone = clamp(22 + player.redZoneLooks * 4.8 + player.goalLineLooks * 6.5 + player.redZoneScores * 8)
      const breakaway = clamp(28 + player.explosivePlays * 3.8 + Math.max(0, yacAboveExpected) * 8 + Math.max(0, rushOverExpected) * 9)
      const sampleVolume = touches + player.passAttempts
      const evidence = clamp(22 + Math.sqrt(sampleVolume) * 7)
      const index = Math.round(volume * .3 + geometry * .24 + redZone * .18 + breakaway * .16 + evidence * .12)
      const lane = redZone >= Math.max(volume, geometry, breakaway)
        ? 'Red-zone role'
        : geometry >= Math.max(volume, breakaway)
          ? isQuarterback ? 'Vertical passing' : 'Route geometry'
          : breakaway > volume
            ? 'Explosive lane'
            : isQuarterback ? 'Dropback volume' : 'Volume lane'

      return {
        id: player.id,
        name: player.name,
        team: player.team,
        position: playerBio?.position ?? player.position,
        headshot: playerBio?.headshot ?? null,
        jersey: playerBio?.jersey ?? null,
        games: player.games.size || 1,
        index,
        volume: Math.round(volume),
        geometry: Math.round(geometry),
        redZone: Math.round(redZone),
        breakaway: Math.round(breakaway),
        evidence: Math.round(evidence),
        targets: player.targets,
        receptions: player.receptions,
        receivingYards: player.receivingYards,
        carries: player.carries,
        rushingYards: player.rushingYards,
        passAttempts: player.passAttempts,
        completions: player.completions,
        passingYards: player.passingYards,
        touchdowns: player.touchdowns,
        targetShare,
        carryShare,
        airYards: round1(airYards),
        airYardsShare: round1(airYardsShare),
        separation: round1(separation),
        yacAboveExpected: round1(yacAboveExpected),
        rushOverExpected: round1(rushOverExpected),
        catchRate: percent(player.receptions, player.targets),
        completionRate: percent(player.completions, player.passAttempts),
        cpoe: round1(cpoe),
        timeToThrow: round1(timeToThrow),
        redZoneLooks: player.redZoneLooks,
        goalLineLooks: player.goalLineLooks,
        explosivePlays: player.explosivePlays,
        lane,
      }
    })
    .sort((a, b) => b.index - a.index || b.targets + b.carries + b.passAttempts - (a.targets + a.carries + a.passAttempts))
}

function buildHeadline(away: SidelineTeamProfile, home: SidelineTeamProfile) {
  const aggressor = away.neutralPassRate >= home.neutralPassRate ? away : home
  const opponent = aggressor.team.abbr === away.team.abbr ? home : away
  const script = aggressor.neutralPassRate >= 58 ? 'Air-first opening' : aggressor.explosiveRate >= 10 ? 'Explosive pressure' : 'Balanced leverage'
  const detail = `${aggressor.team.abbr} owns the stronger early-down tendency; ${opponent.team.abbr} has allowed ${opponent.defenseExplosiveAllowed.toFixed(1)}% explosive plays in the loaded sample.`
  return { script, detail, aggressor: aggressor.team.abbr }
}

async function querySeason(game: SidelineGame, season: number) {
  const admin = createAdminClient()
  const teams = [game.away.abbr, game.home.abbr]
  const [pbpResult, receivingResult, rushingResult, passingResult, bioResult] = await Promise.all([
    admin.from('nfl_pbp')
      .select('game_id,week,posteam,defteam,qtr,down,ydstogo,yards_gained,score_differential,yardline_100,shotgun,no_huddle,qb_dropback,pass_attempt,rush_attempt,success,pass_touchdown,rush_touchdown,receiver_player_id,receiver_player_name,rusher_player_id,rusher_player_name')
      .eq('season', season).eq('season_type', 'REG')
      .or(`posteam.in.(${teams.join(',')}),defteam.in.(${teams.join(',')})`).limit(7000),
    admin.from('nfl_ngs_receiving')
      .select('player_gsis_id,player_display_name,player_short_name,player_position,team_abbr,week,avg_separation,avg_intended_air_yards,percent_share_of_intended_air_yards,receptions,targets,yards,rec_touchdowns,avg_yac_above_expectation')
      .eq('season', season).eq('season_type', 'REG').in('team_abbr', teams),
    admin.from('nfl_ngs_rushing')
      .select('player_gsis_id,player_display_name,player_short_name,player_position,team_abbr,week,rush_attempts,rush_yards,rush_touchdowns,rush_yards_over_expected_per_att')
      .eq('season', season).eq('season_type', 'REG').in('team_abbr', teams),
    admin.from('nfl_ngs_passing')
      .select('player_gsis_id,player_display_name,player_short_name,player_position,team_abbr,week,attempts,completions,pass_yards,pass_touchdowns,avg_intended_air_yards,completion_percentage_above_expectation,avg_time_to_throw')
      .eq('season', season).eq('season_type', 'REG').in('team_abbr', teams),
    admin.from('nfl_players').select('gsis_id,headshot,jersey_number,position').in('latest_team', teams),
  ])

  const bio = new Map<string, { headshot: string | null; jersey: number | null; position: string | null }>()
  for (const row of bioResult.data ?? []) {
    bio.set(String(row.gsis_id), { headshot: row.headshot ?? null, jersey: row.jersey_number ?? null, position: row.position ?? null })
  }
  return {
    pbp: (pbpResult.data ?? []) as Row[],
    receiving: (receivingResult.data ?? []) as Row[],
    rushing: (rushingResult.data ?? []) as Row[],
    passing: (passingResult.data ?? []) as Row[],
    bio,
  }
}

function availableWeeks(data: Awaited<ReturnType<typeof querySeason>>) {
  return Array.from(new Set([
    ...data.pbp.map(row => numeric(row.week)),
    ...data.receiving.map(row => numeric(row.week)),
    ...data.rushing.map(row => numeric(row.week)),
    ...data.passing.map(row => numeric(row.week)),
  ].filter(week => week > 0))).sort((a, b) => b - a)
}

function rowsForWeeks(rows: Row[], weeks: number[] | null) {
  if (weeks == null) {
    const aggregate = rows.filter(row => numeric(row.week) === 0)
    return aggregate.length ? aggregate : rows.filter(row => numeric(row.week) > 0)
  }
  const set = new Set(weeks)
  return rows.filter(row => set.has(numeric(row.week)))
}

function buildWindow(game: SidelineGame, data: Awaited<ReturnType<typeof querySeason>>, weeks: number[] | null): SidelineWindowData {
  const pbp = weeks == null ? data.pbp : rowsForWeeks(data.pbp, weeks)
  return {
    plays: pbp.length,
    weeks: weeks ?? availableWeeks(data),
    teams: [profileTeam(game.away, pbp), profileTeam(game.home, pbp)],
    players: buildPlayers(
      rowsForWeeks(data.receiving, weeks),
      rowsForWeeks(data.rushing, weeks),
      rowsForWeeks(data.passing, weeks),
      pbp,
      [game.away, game.home],
      data.bio,
    ),
  }
}

function emptyWindow(game: SidelineGame): SidelineWindowData {
  return { plays: 0, weeks: [], teams: [emptyTeamProfile(game.away), emptyTeamProfile(game.home)], players: [] }
}

export async function getSidelineBoardLens(game: SidelineGame): Promise<SidelineLens> {
  const preferredSeason = game.gameType === 'REG' && game.week > 3 ? game.season : game.season - 1
  try {
    let season = preferredSeason
    let data = await querySeason(game, season)
    if (!data.pbp.length && !data.receiving.length && season > 2020) {
      season -= 1
      data = await querySeason(game, season)
    }
    const weeks = availableWeeks(data)
    const windows: Record<SidelineWindow, SidelineWindowData> = {
      season: buildWindow(game, data, null),
      l1: buildWindow(game, data, weeks.slice(0, 1)),
      l3: buildWindow(game, data, weeks.slice(0, 3)),
      l5: buildWindow(game, data, weeks.slice(0, 5)),
      l10: buildWindow(game, data, weeks.slice(0, 10)),
    }
    const headline = buildHeadline(windows.season.teams[0], windows.season.teams[1])
    const hasData = Object.values(windows).some(window => window.plays || window.players.length)
    return {
      season,
      status: hasData ? 'calculated' : 'awaiting-data',
      headline: headline.script,
      headlineDetail: headline.detail,
      aggressor: headline.aggressor,
      windows,
    }
  } catch (error) {
    console.error('[the-sideline] board analytics query failed', game.id, error)
    const empty = emptyWindow(game)
    return {
      season: preferredSeason,
      status: 'awaiting-data',
      headline: 'Data sync pending',
      headlineDetail: 'The market board is ready; historical NFL tracking data is not available in this environment.',
      aggressor: game.away.abbr,
      windows: { season: empty, l1: empty, l3: empty, l5: empty, l10: empty },
    }
  }
}
