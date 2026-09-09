import 'server-only'
import { nflSampleReference, type NflSample } from '@/lib/nflSample'

import { createAdminClient } from '@/lib/supabase/admin'
import { getNflBdlCurrentSeasonStats, type NflBdlPlayerStat } from '@/lib/nflOdds'
import type {
  SidelineGame,
  SidelineLens,
  SidelinePlayer,
  SidelineTeamProfile,
  SidelineWindow,
  SidelineWindowData,
  SidelineRosterPlayer,
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
const TEAM_ALIASES: Record<string, string> = { LA: 'LAR', JAC: 'JAX', OAK: 'LV', SD: 'LAC', STL: 'LAR', WAS: 'WSH' }
const canonicalTeam = (value: unknown) => {
  const upper = String(value ?? '').toUpperCase()
  return TEAM_ALIASES[upper] ?? upper
}

type CurrentStatRow = NflBdlPlayerStat & { sampleIndex: number }

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
  bio: Map<string, { headshot: string | null; headshotFallbacks: string[]; jersey: number | null; position: string | null; rookieSeason: number | null; latestTeam: string | null; rosterStatus: string | null }>,
  rosterTeams: Map<string, string>,
  currentStats: CurrentStatRow[],
  roster: SidelineRosterPlayer[],
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
    addWeighted(player, 'airYardsTotal', 'airYardsWeight', row.avg_intended_air_yards, attempts)
    addWeighted(player, 'cpoeTotal', 'cpoeWeight', row.completion_percentage_above_expectation, attempts)
    addWeighted(player, 'timeToThrowTotal', 'timeToThrowWeight', row.avg_time_to_throw, attempts)
    teamPassAttempts.set(player.team, (teamPassAttempts.get(player.team) ?? 0) + attempts)
  }

  // Box-score volume replaces NGS volume within the same selected season/phase.
  // Never add these overlapping sources or borrow another season's tracking.
  if (currentStats.length) {
    const rosterByBdl = new Map(roster.map(player => [player.bdlId, player]))
    const currentByPlayer = new Map<string, PlayerAccumulator>()
    const currentTeamTargets = new Map<string, number>()
    const currentTeamCarries = new Map<string, number>()
    const currentTeamPassAttempts = new Map<string, number>()
    for (const row of currentStats) {
      const statTeam = canonicalTeam(row.team?.abbreviation ?? row.player.team?.abbreviation)
      if (!teams.some(team => team.abbr === statTeam)) continue
      const targets = numeric(row.receiving_targets)
      const carries = numeric(row.rushing_attempts ?? row.rush_attempts)
      const passAttempts = numeric(row.passing_attempts)
      currentTeamTargets.set(statTeam, (currentTeamTargets.get(statTeam) ?? 0) + targets)
      currentTeamCarries.set(statTeam, (currentTeamCarries.get(statTeam) ?? 0) + carries)
      currentTeamPassAttempts.set(statTeam, (currentTeamPassAttempts.get(statTeam) ?? 0) + passAttempts)

      const rosterPlayer = rosterByBdl.get(row.player.id)
      if (!rosterPlayer) continue
      let player = currentByPlayer.get(rosterPlayer.id)
      if (!player) {
        player = ensurePlayer(new Map(), {
          player_gsis_id: rosterPlayer.id,
          player_display_name: rosterPlayer.name,
          player_position: rosterPlayer.position,
          team_abbr: rosterPlayer.team,
        }, rosterPlayer.position)!
        currentByPlayer.set(rosterPlayer.id, player)
      }
      player.team = rosterPlayer.team || statTeam
      if (row.sampleIndex > 0) player.games.add(row.sampleIndex)
      player.targets += targets
      player.receptions += numeric(row.receptions)
      player.receivingYards += numeric(row.receiving_yards)
      player.carries += carries
      player.rushingYards += numeric(row.rushing_yards)
      player.passAttempts += passAttempts
      player.completions += numeric(row.passing_completions)
      player.passingYards += numeric(row.passing_yards)
      // ATD/FTD concern touchdowns scored by the player, not QB passing TDs.
      player.touchdowns += numeric(row.receiving_touchdowns) + numeric(row.rushing_touchdowns)
    }
    for (const [id, current] of currentByPlayer) {
      const historical = playerMap.get(id)
      if (historical) {
        historical.name = current.name
        historical.team = current.team
        historical.games = current.games
        historical.targets = current.targets
        historical.receptions = current.receptions
        historical.receivingYards = current.receivingYards
        historical.carries = current.carries
        historical.rushingYards = current.rushingYards
        historical.passAttempts = current.passAttempts
        historical.completions = current.completions
        historical.passingYards = current.passingYards
        historical.touchdowns = current.touchdowns
      } else {
        playerMap.set(id, current)
      }
    }
    for (const team of teams) {
      teamTargets.set(team.abbr, currentTeamTargets.get(team.abbr) ?? 0)
      teamCarries.set(team.abbr, currentTeamCarries.get(team.abbr) ?? 0)
      teamPassAttempts.set(team.abbr, currentTeamPassAttempts.get(team.abbr) ?? 0)
    }
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
    .filter(player => (
      teams.some(team => team.abbr === player.team)
      || teams.some(team => team.abbr === rosterTeams.get(player.id))
    ) && player.targets + player.carries + player.passAttempts > 0)
    .map(player => {
      const playerBio = bio.get(player.id)
      const sampleTeam = player.team
      const rosterTeam = rosterTeams.get(player.id)
      if (rosterTeam) player.team = rosterTeam
      const touches = player.targets + player.carries
      const targetShare = percent(player.targets, teamTargets.get(sampleTeam) ?? 0)
      const carryShare = percent(player.carries, teamCarries.get(sampleTeam) ?? 0)
      const passShare = percent(player.passAttempts, teamPassAttempts.get(sampleTeam) ?? 0)
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
        unavailableMetrics: [
          ...(!pbp.some(row => row.posteam === sampleTeam) ? ['redZoneLooks', 'goalLineLooks', 'explosivePlays', 'redZone', 'breakaway'] : []),
          ...(!player.airYardsWeight ? ['airYards'] : []),
          ...(!player.airShareWeight ? ['airYardsShare'] : []),
          ...(!player.separationWeight ? ['separation'] : []),
          ...(!player.yacWeight ? ['yacAboveExpected'] : []),
          ...(!player.rushOeWeight ? ['rushOverExpected'] : []),
          ...(!player.cpoeWeight ? ['cpoe'] : []),
          ...(!player.timeToThrowWeight ? ['timeToThrow'] : []),
        ],
        name: player.name,
        team: player.team,
        position: playerBio?.position ?? player.position,
        headshot: playerBio?.headshot ?? null,
        headshotFallbacks: playerBio?.headshotFallbacks ?? [],
        jersey: playerBio?.jersey ?? null,
        rookieSeason: playerBio?.rookieSeason ?? null,
        latestTeam: playerBio?.latestTeam ?? null,
        rosterStatus: playerBio?.rosterStatus ?? null,
        sampleTeam,
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

async function querySeason(game: SidelineGame, season: number, roster: SidelineRosterPlayer[], phase: 'PRE' | 'REG') {
  const admin = createAdminClient()
  const teams = [game.away.abbr, game.home.abbr]
  const rosterIds = Array.from(new Set(roster.map(player => player.id).filter(id => id && !id.startsWith('bdl-'))))
  const teamIds = Array.from(new Set(roster.map(player => player.teamId).filter((id): id is number => id != null)))
  const loadPlays = async () => {
    const rows: Row[] = []
    for (let offset = 0; offset < 20000; offset += 500) {
      const result = await admin.from('nfl_pbp')
        .select('game_id,week,posteam,defteam,qtr,down,ydstogo,yards_gained,score_differential,yardline_100,shotgun,no_huddle,qb_dropback,pass_attempt,rush_attempt,success,pass_touchdown,rush_touchdown,receiver_player_id,receiver_player_name,rusher_player_id,rusher_player_name')
        .eq('season', season).eq('season_type', phase).lt('game_date', game.gameday)
        .or(`posteam.in.(${teams.join(',')}),defteam.in.(${teams.join(',')})`)
        .order('game_id').order('play_id').range(offset, offset + 499)
      if (result.error) throw new Error(`NFL play sample unavailable: ${result.error.message}`)
      rows.push(...result.data)
      if (result.data.length < 500) return { data: rows }
    }
    throw new Error('NFL play sample exceeded paging bound; refusing a partial sample')
  }
  const [pbpResult, receivingResult, rushingResult, passingResult, currentStatsRaw] = await Promise.all([
    loadPlays(),
    admin.from('nfl_ngs_receiving')
      .select('player_gsis_id,player_display_name,player_short_name,player_position,team_abbr,week,avg_separation,avg_intended_air_yards,percent_share_of_intended_air_yards,receptions,targets,yards,rec_touchdowns,avg_yac_above_expectation')
      .eq('season', season).eq('season_type', phase).in('team_abbr', teams),
    admin.from('nfl_ngs_rushing')
      .select('player_gsis_id,player_display_name,player_short_name,player_position,team_abbr,week,rush_attempts,rush_yards,rush_touchdowns,rush_yards_over_expected_per_att')
      .eq('season', season).eq('season_type', phase).in('team_abbr', teams),
    admin.from('nfl_ngs_passing')
      .select('player_gsis_id,player_display_name,player_short_name,player_position,team_abbr,week,attempts,completions,pass_yards,pass_touchdowns,avg_intended_air_yards,completion_percentage_above_expectation,avg_time_to_throw')
      .eq('season', season).eq('season_type', phase).in('team_abbr', teams),
    getNflBdlCurrentSeasonStats(season, teamIds, phase === 'PRE' ? 1 : 2).catch(error => {
      console.error('[the-sideline] current-season BDL stats unavailable', game.id, error)
      return []
    }),
  ])

  const rosterReceiving = rosterIds.length ? await admin.from('nfl_ngs_receiving')
    .select('player_gsis_id,player_display_name,player_short_name,player_position,team_abbr,week,avg_separation,avg_intended_air_yards,percent_share_of_intended_air_yards,receptions,targets,yards,rec_touchdowns,avg_yac_above_expectation')
    .eq('season', season).eq('season_type', phase).in('player_gsis_id', rosterIds) : { data: [] }
  const rosterRushing = rosterIds.length ? await admin.from('nfl_ngs_rushing')
    .select('player_gsis_id,player_display_name,player_short_name,player_position,team_abbr,week,rush_attempts,rush_yards,rush_touchdowns,rush_yards_over_expected_per_att')
    .eq('season', season).eq('season_type', phase).in('player_gsis_id', rosterIds) : { data: [] }
  const rosterPassing = rosterIds.length ? await admin.from('nfl_ngs_passing')
    .select('player_gsis_id,player_display_name,player_short_name,player_position,team_abbr,week,attempts,completions,pass_yards,pass_touchdowns,avg_intended_air_yards,completion_percentage_above_expectation,avg_time_to_throw')
    .eq('season', season).eq('season_type', phase).in('player_gsis_id', rosterIds) : { data: [] }

  const uniqueRows = (rows: Row[]) => Array.from(new Map(rows.map(row => [`${row.player_gsis_id}:${row.week}`, row])).values())
  const receiving = uniqueRows([...(receivingResult.data ?? []) as Row[], ...(rosterReceiving.data ?? []) as Row[]])
  const rushing = uniqueRows([...(rushingResult.data ?? []) as Row[], ...(rosterRushing.data ?? []) as Row[]])
  const passing = uniqueRows([...(passingResult.data ?? []) as Row[], ...(rosterPassing.data ?? []) as Row[]])
  const actualIds = Array.from(new Set([
    ...receiving.map(row => String(row.player_gsis_id ?? '')),
    ...rushing.map(row => String(row.player_gsis_id ?? '')),
    ...passing.map(row => String(row.player_gsis_id ?? '')),
    ...rosterIds,
  ].filter(Boolean)))
  const bioResult = actualIds.length
    ? await admin.from('nfl_players').select('gsis_id,headshot,jersey_number,position,rookie_season,last_season,latest_team,status,espn_id').in('gsis_id', actualIds)
    : { data: [] }

  const bio = new Map<string, { headshot: string | null; headshotFallbacks: string[]; jersey: number | null; position: string | null; rookieSeason: number | null; latestTeam: string | null; rosterStatus: string | null }>()
  for (const row of bioResult.data ?? []) {
    const espn = row.espn_id ? `https://a.espncdn.com/i/headshots/nfl/players/full/${row.espn_id}.png` : null
    const headshotFallbacks = Array.from(new Set([row.headshot, espn].filter((value): value is string => Boolean(value))))
    bio.set(String(row.gsis_id), {
      headshot: headshotFallbacks[0] ?? null,
      headshotFallbacks,
      jersey: row.jersey_number ?? null,
      position: row.position ?? null,
      rookieSeason: row.rookie_season ?? null,
      latestTeam: row.latest_team ?? null,
      rosterStatus: row.status ?? null,
    })
  }
  const eligibleStats = currentStatsRaw.filter(row => row.game?.date && row.game.date.slice(0, 10) < game.gameday)
  const currentGameKeys = Array.from(new Set(eligibleStats.map(row => `${row.game?.date ?? ''}:${row.game?.id ?? ''}`)))
    .sort((a, b) => a.localeCompare(b))
  const sampleIndex = new Map(currentGameKeys.map((key, index) => [key, index + 1]))
  const currentStats: CurrentStatRow[] = eligibleStats.map(row => ({
    ...row,
    sampleIndex: row.game?.week ?? sampleIndex.get(`${row.game?.date ?? ''}:${row.game?.id ?? ''}`) ?? 0,
  }))
  return {
    pbp: (pbpResult.data ?? []) as Row[],
    receiving,
    rushing,
    passing,
    bio,
    rosterTeams: new Map(roster.map(player => [player.id, player.team])),
    currentStats,
    roster,
  }
}

function availableWeeks(data: Awaited<ReturnType<typeof querySeason>>) {
  const currentSamples = Array.from(new Set(data.currentStats.map(row => row.sampleIndex).filter(index => index > 0))).sort((a, b) => b - a)
  if (currentSamples.length) return currentSamples
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
  const currentSample = data.currentStats.length > 0
  const historicalWeeks = currentSample && weeks != null
    ? Array.from(new Set(data.pbp.map(row => numeric(row.week)).filter(week => week > 0))).sort((a, b) => b - a).slice(0, weeks.length)
    : weeks
  const pbp = historicalWeeks == null ? data.pbp : rowsForWeeks(data.pbp, historicalWeeks)
  const currentStats = weeks == null
    ? data.currentStats
    : data.currentStats.filter(row => new Set(weeks).has(row.sampleIndex))
  return {
    plays: pbp.length,
    weeks: weeks ?? availableWeeks(data),
    teams: [profileTeam(game.away, pbp), profileTeam(game.home, pbp)],
    players: buildPlayers(
      rowsForWeeks(data.receiving, historicalWeeks),
      rowsForWeeks(data.rushing, historicalWeeks),
      rowsForWeeks(data.passing, historicalWeeks),
      pbp,
      [game.away, game.home],
      data.bio,
      data.rosterTeams,
      currentStats,
      data.roster,
    ),
  }
}

function emptyWindow(game: SidelineGame): SidelineWindowData {
  return { plays: 0, weeks: [], teams: [emptyTeamProfile(game.away), emptyTeamProfile(game.home)], players: [] }
}

export async function getSidelineBoardLens(game: SidelineGame, roster: SidelineRosterPlayer[] = [], sample: NflSample = 'previous'): Promise<SidelineLens> {
  const reference = nflSampleReference(game.season, sample)
  const preferredSeason = reference.season
  try {
    const season = preferredSeason
    const data = await querySeason(game, season, roster, reference.phase)
    const weeks = availableWeeks(data)
    const windows: Record<SidelineWindow, SidelineWindowData> = {
      season: buildWindow(game, data, null),
      l1: buildWindow(game, data, weeks.slice(0, 1)),
      l3: buildWindow(game, data, weeks.slice(0, 3)),
      l5: buildWindow(game, data, weeks.slice(0, 5)),
      l10: buildWindow(game, data, weeks.slice(0, 10)),
    }
    const headline = windows.season.plays > 0 ? buildHeadline(windows.season.teams[0], windows.season.teams[1]) : {
      script: 'Play-by-play unavailable',
      detail: 'Box-score production may be available, but this sample cannot establish defensive tendencies or red-zone context.',
      aggressor: game.away.abbr,
    }
    const hasData = Object.values(windows).some(window => window.plays || window.players.length)
    const currentProductionGames = new Set(data.currentStats.map(row => row.game?.id).filter(Boolean)).size
    const hasCurrentProduction = currentProductionGames > 0
    return {
      season,
      status: hasData ? 'calculated' : 'awaiting-data',
      headline: headline.script,
      headlineDetail: headline.detail,
      aggressor: headline.aggressor,
      coverage: {
        sampleSeason: season,
        scheduleStart: 1999,
        trackingStart: 2016,
        playByPlayStart: 2022,
        usesPriorSeason: season < game.season,
        label: reference.label,
        detail: `Only ${reference.label} data is used. Missing tracking is unavailable, never substituted from another season. Stats from prior teams remain identified on player rows.`,
        currentProductionSeason: hasCurrentProduction ? season : null,
        currentProductionPhase: reference.phase === 'PRE' ? 'PRESEASON' : 'REGULAR',
        currentProductionGames,
      },
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
      coverage: {
        sampleSeason: preferredSeason,
        scheduleStart: 1999,
        trackingStart: 2016,
        playByPlayStart: 2022,
        usesPriorSeason: preferredSeason < game.season,
        label: 'Tracking sync pending',
        detail: 'Market rows remain available while the historical NFL sample is loading.',
      },
      windows: { season: empty, l1: empty, l3: empty, l5: empty, l10: empty },
    }
  }
}
