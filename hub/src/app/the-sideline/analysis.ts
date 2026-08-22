import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { SidelineGame, SidelineLens, SidelinePlayer, SidelineTeamProfile } from './SidelineClient'

type Row = Record<string, unknown>

const numeric = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const truthy = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true'
const clamp = (value: number, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, value))
const percent = (part: number, total: number) => total > 0 ? Math.round((part / total) * 1000) / 10 : 0

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
  targets: number
  receptions: number
  carries: number
  yards: number
  touchdowns: number
  airYards: number
  separation: number
  yacAboveExpected: number
  rushOverExpected: number
  redZoneLooks: number
  redZoneScores: number
  explosivePlays: number
}

function ensurePlayer(map: Map<string, PlayerAccumulator>, row: Row, kind: 'receiving' | 'rushing') {
  const id = String(row.player_gsis_id ?? '')
  if (!id) return null
  const existing = map.get(id)
  if (existing) return existing
  const created: PlayerAccumulator = {
    id,
    name: String(row.player_display_name ?? row.player_short_name ?? 'Unknown player'),
    team: String(row.team_abbr ?? ''),
    position: String(row.player_position ?? (kind === 'rushing' ? 'RB' : 'WR')),
    targets: 0,
    receptions: 0,
    carries: 0,
    yards: 0,
    touchdowns: 0,
    airYards: 0,
    separation: 0,
    yacAboveExpected: 0,
    rushOverExpected: 0,
    redZoneLooks: 0,
    redZoneScores: 0,
    explosivePlays: 0,
  }
  map.set(id, created)
  return created
}

function buildPlayers(receiving: Row[], rushing: Row[], pbp: Row[], teams: SidelineGame['home'][]): SidelinePlayer[] {
  const playerMap = new Map<string, PlayerAccumulator>()
  const teamTargets = new Map<string, number>()
  const teamCarries = new Map<string, number>()

  for (const row of receiving) {
    const player = ensurePlayer(playerMap, row, 'receiving')
    if (!player) continue
    player.targets += numeric(row.targets)
    player.receptions += numeric(row.receptions)
    player.yards += numeric(row.yards)
    player.touchdowns += numeric(row.rec_touchdowns)
    player.airYards = numeric(row.avg_intended_air_yards)
    player.separation = numeric(row.avg_separation)
    player.yacAboveExpected = numeric(row.avg_yac_above_expectation)
    teamTargets.set(player.team, (teamTargets.get(player.team) ?? 0) + numeric(row.targets))
  }

  for (const row of rushing) {
    const player = ensurePlayer(playerMap, row, 'rushing')
    if (!player) continue
    player.carries += numeric(row.rush_attempts)
    player.yards += numeric(row.rush_yards)
    player.touchdowns += numeric(row.rush_touchdowns)
    player.rushOverExpected = numeric(row.rush_yards_over_expected_per_att)
    teamCarries.set(player.team, (teamCarries.get(player.team) ?? 0) + numeric(row.rush_attempts))
  }

  const byName = new Map(Array.from(playerMap.values()).map(player => [player.name.toLowerCase(), player]))
  for (const row of pbp) {
    const isRedZone = numeric(row.yardline_100) > 0 && numeric(row.yardline_100) <= 20
    const name = String(row.receiver_player_name ?? row.rusher_player_name ?? '').toLowerCase()
    const id = String(row.receiver_player_id ?? row.rusher_player_id ?? '')
    const player = playerMap.get(id) ?? byName.get(name)
    if (!player) continue
    if (isRedZone) player.redZoneLooks += 1
    if (isRedZone && (truthy(row.pass_touchdown) || truthy(row.rush_touchdown))) player.redZoneScores += 1
    if (truthy(row.pass_attempt) ? numeric(row.yards_gained) >= 20 : numeric(row.yards_gained) >= 10) player.explosivePlays += 1
  }

  return Array.from(playerMap.values())
    .filter(player => teams.some(team => team.abbr === player.team) && player.targets + player.carries >= 8)
    .map(player => {
      const touches = player.targets + player.carries
      const targetShare = percent(player.targets, teamTargets.get(player.team) ?? 0)
      const carryShare = percent(player.carries, teamCarries.get(player.team) ?? 0)
      const volume = clamp(targetShare * 1.55 + carryShare * 0.85)
      const geometry = clamp(34 + player.airYards * 2.4 + player.separation * 5 + Math.max(0, player.rushOverExpected) * 12)
      const redZone = clamp(player.redZoneLooks * 7 + player.redZoneScores * 9)
      const breakaway = clamp(28 + player.explosivePlays * 4 + Math.max(0, player.yacAboveExpected) * 9 + Math.max(0, player.rushOverExpected) * 10)
      const evidence = clamp(28 + Math.sqrt(touches) * 6)
      const index = Math.round(volume * .3 + geometry * .24 + redZone * .18 + breakaway * .16 + evidence * .12)
      const lane = redZone >= Math.max(volume, geometry, breakaway)
        ? 'Red-zone role'
        : geometry >= Math.max(volume, breakaway)
          ? 'Route geometry'
          : breakaway > volume
            ? 'Explosive lane'
            : 'Volume lane'

      return {
        id: player.id,
        name: player.name,
        team: player.team,
        position: player.position,
        index,
        volume: Math.round(volume),
        geometry: Math.round(geometry),
        redZone: Math.round(redZone),
        breakaway: Math.round(breakaway),
        evidence: Math.round(evidence),
        targets: player.targets,
        carries: player.carries,
        targetShare,
        carryShare,
        airYards: Math.round(player.airYards * 10) / 10,
        separation: Math.round(player.separation * 10) / 10,
        redZoneLooks: player.redZoneLooks,
        lane,
      }
    })
    .sort((a, b) => b.index - a.index)
    .slice(0, 12)
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
  const [pbpResult, receivingResult, rushingResult] = await Promise.all([
    admin
      .from('nfl_pbp')
      .select('game_id,posteam,defteam,qtr,down,ydstogo,yards_gained,score_differential,yardline_100,shotgun,no_huddle,qb_dropback,pass_attempt,rush_attempt,success,pass_touchdown,rush_touchdown,receiver_player_id,receiver_player_name,rusher_player_id,rusher_player_name')
      .eq('season', season)
      .eq('season_type', 'REG')
      .or(`posteam.in.(${teams.join(',')}),defteam.in.(${teams.join(',')})`)
      .limit(5000),
    admin
      .from('nfl_ngs_receiving')
      .select('player_gsis_id,player_display_name,player_short_name,player_position,team_abbr,avg_separation,avg_intended_air_yards,receptions,targets,yards,rec_touchdowns,avg_yac_above_expectation')
      .eq('season', season)
      .eq('week', 0)
      .eq('season_type', 'REG')
      .in('team_abbr', teams),
    admin
      .from('nfl_ngs_rushing')
      .select('player_gsis_id,player_display_name,player_short_name,player_position,team_abbr,rush_attempts,rush_yards,rush_touchdowns,rush_yards_over_expected_per_att')
      .eq('season', season)
      .eq('week', 0)
      .eq('season_type', 'REG')
      .in('team_abbr', teams),
  ])

  return {
    pbp: (pbpResult.data ?? []) as Row[],
    receiving: (receivingResult.data ?? []) as Row[],
    rushing: (rushingResult.data ?? []) as Row[],
  }
}

export async function getSidelineLens(game: SidelineGame): Promise<SidelineLens> {
  const preferredSeason = game.gameType === 'REG' && game.week > 3 ? game.season : game.season - 1
  try {
    let season = preferredSeason
    let data = await querySeason(game, season)
    if (!data.pbp.length && !data.receiving.length && season > 2020) {
      season -= 1
      data = await querySeason(game, season)
    }

    const away = profileTeam(game.away, data.pbp)
    const home = profileTeam(game.home, data.pbp)
    const players = buildPlayers(data.receiving, data.rushing, data.pbp, [game.away, game.home])
    const headline = buildHeadline(away, home)

    return {
      season,
      plays: data.pbp.length,
      status: data.pbp.length || players.length ? 'calculated' : 'awaiting-data',
      headline: headline.script,
      headlineDetail: headline.detail,
      aggressor: headline.aggressor,
      teams: [away, home],
      players,
    }
  } catch {
    return {
      season: preferredSeason,
      plays: 0,
      status: 'awaiting-data',
      headline: 'Data sync pending',
      headlineDetail: 'The matchup shell is ready; historical NFL data is not available in this environment.',
      aggressor: game.away.abbr,
      teams: [emptyTeamProfile(game.away), emptyTeamProfile(game.home)],
      players: [],
    }
  }
}
