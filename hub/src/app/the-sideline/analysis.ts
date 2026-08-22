import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  SidelineGame,
  SidelineHistoricalGame,
  SidelineLens,
  SidelinePlay,
  SidelinePlayer,
  SidelineTeamProfile,
} from './SidelineClient'

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
  headshot: string | null
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
    headshot: null,
  }
  map.set(id, created)
  return created
}

function buildPlayers(receiving: Row[], rushing: Row[], pbp: Row[], teams: SidelineGame['home'][], headshots: Map<string, string>): SidelinePlayer[] {
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
  for (const player of playerMap.values()) player.headshot = headshots.get(player.id) ?? null
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
        headshot: player.headshot,
      }
    })
    .sort((a, b) => b.index - a.index)
    .slice(0, 12)
}

const text = (value: unknown) => value == null ? '' : String(value)
const nullableText = (value: unknown) => {
  const normalized = text(value).trim()
  return normalized ? normalized : null
}

function mapHistoricalGame(row: Row, teamMap: Map<string, SidelineGame['home']>): SidelineHistoricalGame {
  const awayAbbr = text(row.away_team)
  const homeAbbr = text(row.home_team)
  return {
    id: text(row.game_id),
    season: numeric(row.season),
    week: numeric(row.week),
    gameType: text(row.game_type),
    gameday: text(row.gameday),
    away: teamMap.get(awayAbbr) ?? { abbr: awayAbbr, name: awayAbbr, color: '#243244', logo: null },
    home: teamMap.get(homeAbbr) ?? { abbr: homeAbbr, name: homeAbbr, color: '#243244', logo: null },
    awayScore: numeric(row.away_score),
    homeScore: numeric(row.home_score),
  }
}

function clockLabel(row: Row) {
  const seconds = numeric(row.quarter_seconds_remaining)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.max(0, Math.floor(seconds % 60))).padStart(2, '0')}`
}

function playerIdentity(row: Row) {
  if (truthy(row.pass_attempt)) return {
    id: nullableText(row.receiver_player_id),
    name: nullableText(row.receiver_player_name),
    role: 'TARGET' as const,
  }
  return {
    id: nullableText(row.rusher_player_id),
    name: nullableText(row.rusher_player_name),
    role: 'RUSHER' as const,
  }
}

function mapPlay(row: Row, headshots: Map<string, string>): SidelinePlay {
  const player = playerIdentity(row)
  const yards = numeric(row.yards_gained)
  const touchdown = truthy(row.touchdown) || truthy(row.pass_touchdown) || truthy(row.rush_touchdown)
  const turnover = truthy(row.interception) || truthy(row.fumble_lost)
  const explosive = truthy(row.pass_attempt) ? yards >= 20 : yards >= 10
  return {
    id: `${text(row.game_id)}-${numeric(row.play_id)}`,
    gameId: text(row.game_id),
    playId: numeric(row.play_id),
    offense: text(row.posteam),
    defense: text(row.defteam),
    quarter: numeric(row.qtr),
    clock: clockLabel(row),
    down: numeric(row.down),
    distance: numeric(row.ydstogo),
    yardline: numeric(row.yardline_100),
    playType: truthy(row.pass_attempt) ? 'pass' : 'run',
    description: text(row.play_desc),
    yards,
    airYards: numeric(row.air_yards),
    yardsAfterCatch: numeric(row.yards_after_catch),
    passLocation: nullableText(row.pass_location),
    runLocation: nullableText(row.run_location),
    runGap: nullableText(row.run_gap),
    complete: truthy(row.complete_pass),
    firstDown: truthy(row.first_down),
    touchdown,
    turnover,
    success: truthy(row.success),
    explosive,
    epa: Math.round(numeric(row.epa) * 100) / 100,
    scoreOffense: numeric(row.posteam_score),
    scoreDefense: numeric(row.defteam_score),
    playerId: player.id,
    playerName: player.name,
    playerRole: player.role,
    playerHeadshot: player.id ? headshots.get(player.id) ?? null : null,
    passerId: nullableText(row.passer_player_id),
    passerName: nullableText(row.passer_player_name),
    passerHeadshot: nullableText(row.passer_player_id) ? headshots.get(text(row.passer_player_id)) ?? null : null,
  }
}

const playSelect = 'game_id,play_id,posteam,defteam,qtr,quarter_seconds_remaining,down,ydstogo,yardline_100,play_desc,yards_gained,air_yards,yards_after_catch,pass_location,run_location,run_gap,pass_attempt,rush_attempt,complete_pass,first_down,touchdown,pass_touchdown,rush_touchdown,interception,fumble_lost,success,epa,posteam_score,defteam_score,passer_player_id,passer_player_name,receiver_player_id,receiver_player_name,rusher_player_id,rusher_player_name'

async function playRowsForGame(gameId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('nfl_pbp')
    .select(playSelect)
    .eq('game_id', gameId)
    .in('play_type', ['pass', 'run'])
    .eq('play_deleted', false)
    .order('play_id', { ascending: true })
    .limit(500)
  if (error) throw error
  return (data ?? []) as Row[]
}

async function queryHeadshots(playerIds: string[]) {
  const admin = createAdminClient()
  const playerResult = playerIds.length
    ? await admin.from('nfl_players').select('gsis_id,headshot').in('gsis_id', playerIds)
    : { data: [] as Row[] }
  const headshots = new Map<string, string>()
  for (const row of (playerResult.data ?? []) as Row[]) {
    const id = text(row.gsis_id)
    const headshot = nullableText(row.headshot)
    if (id && headshot) headshots.set(id, headshot)
  }
  return headshots
}

async function mapPlayRows(playRows: Row[]) {
  const playerIds = Array.from(new Set(playRows.flatMap(row => [
    nullableText(row.passer_player_id),
    nullableText(row.receiver_player_id),
    nullableText(row.rusher_player_id),
  ]).filter((id): id is string => Boolean(id))))
  const headshots = await queryHeadshots(playerIds)
  return { plays: playRows.map(row => mapPlay(row, headshots)), headshots }
}

export async function getHistoricalGamePlays(gameId: string): Promise<SidelinePlay[]> {
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(gameId)) return []
  const mapped = await mapPlayRows(await playRowsForGame(gameId))
  return mapped.plays
}

async function queryHistory() {
  const admin = createAdminClient()
  const completedGames = admin
    .from('nfl_schedule')
    .select('game_id', { count: 'exact', head: true })
    .not('away_score', 'is', null)
    .not('home_score', 'is', null)
  const teamsResultPromise = admin.from('nfl_teams').select('team_abbr,team_name,team_color,team_logo_espn')
  const [{ count, error: countError }, teamsResult] = await Promise.all([completedGames, teamsResultPromise])
  if (countError) throw countError
  if (teamsResult.error) throw teamsResult.error

  const pageSize = 1000
  const pageCount = Math.ceil((count ?? 0) / pageSize)
  const historyPages = await Promise.all(Array.from({ length: pageCount }, (_, page) => (
    admin
      .from('nfl_schedule')
      .select('game_id,season,game_type,week,gameday,away_team,away_score,home_team,home_score')
      .not('away_score', 'is', null)
      .not('home_score', 'is', null)
      .order('gameday', { ascending: false })
      .order('game_id', { ascending: false })
      .range(page * pageSize, ((page + 1) * pageSize) - 1)
  )))

  const pageError = historyPages.find(page => page.error)?.error
  if (pageError) throw pageError
  const scheduleRows = historyPages.flatMap(page => (page.data ?? []) as Row[])

  const teamMap = new Map<string, SidelineGame['home']>()
  for (const row of (teamsResult.data ?? []) as Row[]) {
    const abbr = text(row.team_abbr)
    teamMap.set(abbr, {
      abbr,
      name: text(row.team_name) || abbr,
      color: text(row.team_color) || '#243244',
      logo: nullableText(row.team_logo_espn),
    })
  }
  const initialRows = scheduleRows[0] ? await playRowsForGame(text(scheduleRows[0].game_id)) : []
  const mapped = await mapPlayRows(initialRows)

  return {
    games: scheduleRows.map(row => mapHistoricalGame(row, teamMap)),
    plays: mapped.plays,
    headshots: mapped.headshots,
  }
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
    const historyPromise = queryHistory()
    let data = await querySeason(game, season)
    if (!data.pbp.length && !data.receiving.length && season > 2020) {
      season -= 1
      data = await querySeason(game, season)
    }

    const history = await historyPromise
    const away = profileTeam(game.away, data.pbp)
    const home = profileTeam(game.home, data.pbp)
    const matchupPlayerIds = Array.from(new Set([...data.receiving, ...data.rushing].map(row => nullableText(row.player_gsis_id)).filter((id): id is string => Boolean(id))))
    const matchupHeadshots = await queryHeadshots(matchupPlayerIds)
    const players = buildPlayers(data.receiving, data.rushing, data.pbp, [game.away, game.home], matchupHeadshots)
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
      historicalGames: history.games,
      historicalPlays: history.plays,
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
      historicalGames: [],
      historicalPlays: [],
    }
  }
}
