import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  SidelineGame,
  SidelineHistoricalGame,
  SidelineLens,
  SidelinePlay,
  SidelinePlayer,
  SidelineProjection,
  SidelineTarget,
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
  receivingYards: number
  receivingTouchdowns: number
  rushingYards: number
  rushingTouchdowns: number
  passAttempts: number
  completions: number
  passingYards: number
  passingTouchdowns: number
  airYards: number
  separation: number
  yacAboveExpected: number
  rushOverExpected: number
  redZoneLooks: number
  redZoneScores: number
  explosivePlays: number
  headshot: string | null
}

function ensurePlayer(map: Map<string, PlayerAccumulator>, row: Row, kind: 'receiving' | 'rushing' | 'passing') {
  const id = String(row.player_gsis_id ?? '')
  if (!id) return null
  const existing = map.get(id)
  if (existing) return existing
  const created: PlayerAccumulator = {
    id,
    name: String(row.player_display_name ?? row.player_short_name ?? 'Unknown player'),
    team: String(row.team_abbr ?? ''),
    position: String(row.player_position ?? (kind === 'rushing' ? 'RB' : kind === 'passing' ? 'QB' : 'WR')),
    targets: 0,
    receptions: 0,
    carries: 0,
    receivingYards: 0,
    receivingTouchdowns: 0,
    rushingYards: 0,
    rushingTouchdowns: 0,
    passAttempts: 0,
    completions: 0,
    passingYards: 0,
    passingTouchdowns: 0,
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

const round = (value: number, digits = 1) => {
  const power = 10 ** digits
  return Math.round(value * power) / power
}

function quantile(values: number[], percentile: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * percentile
  const lower = Math.floor(position)
  const weight = position - lower
  return sorted[lower + 1] == null ? sorted[lower] : sorted[lower] + (sorted[lower + 1] - sorted[lower]) * weight
}

function projectionRange(mean: number, kind: 'count' | 'yards' | 'probability', observed: number[]) {
  if (kind === 'probability') return { low: clamp(mean - 15), high: clamp(mean + 15) }
  if (observed.length >= 3) {
    const observedMean = observed.reduce((sum, value) => sum + value, 0) / observed.length
    const shift = mean - observedMean
    return {
      low: Math.max(0, quantile(observed, .2) + shift),
      high: Math.max(mean, quantile(observed, .8) + shift),
    }
  }
  if (kind === 'yards') return { low: Math.max(0, mean * .62), high: mean * 1.38 }
  const spread = Math.max(1, Math.sqrt(Math.max(mean, .1)) * .9)
  return { low: Math.max(0, mean - spread), high: mean + spread }
}

function matchupAdjustment(dvp: Map<string, number>, opponent: string, position: string, categories: string[]) {
  const values = categories.map(category => dvp.get(`${opponent}:${position}:${category}`)).filter((value): value is number => value != null)
  if (!values.length) return 0
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length, -25, 25) * .7
}

type PlayerGameLine = {
  gameId: string
  receptions: number
  receivingYards: number
  carries: number
  rushingYards: number
  passAttempts: number
  completions: number
  passingYards: number
  touchdowns: number
}

function buildPlayerGameLines(rows: Row[], teams: SidelineGame['home'][]): Map<string, PlayerGameLine[]> {
  const teamSet = new Set(teams.map(team => team.abbr))
  const byPlayer = new Map<string, Map<string, PlayerGameLine>>()
  const line = (playerId: string, gameId: string) => {
    if (!byPlayer.has(playerId)) byPlayer.set(playerId, new Map())
    const games = byPlayer.get(playerId)!
    if (!games.has(gameId)) games.set(gameId, { gameId, receptions: 0, receivingYards: 0, carries: 0, rushingYards: 0, passAttempts: 0, completions: 0, passingYards: 0, touchdowns: 0 })
    return games.get(gameId)!
  }

  for (const row of rows) {
    if (!teamSet.has(String(row.posteam ?? ''))) continue
    const gameId = String(row.game_id ?? '')
    if (!gameId) continue
    if (truthy(row.pass_attempt)) {
      const passerId = String(row.passer_player_id ?? '')
      if (passerId) {
        const game = line(passerId, gameId)
        game.passAttempts += 1
        if (truthy(row.complete_pass)) game.completions += 1
        game.passingYards += numeric(row.yards_gained)
        if (truthy(row.pass_touchdown)) game.touchdowns += 1
      }
      const receiverId = String(row.receiver_player_id ?? '')
      if (receiverId) {
        const game = line(receiverId, gameId)
        if (truthy(row.complete_pass)) {
          game.receptions += 1
          game.receivingYards += numeric(row.yards_gained)
        }
        if (truthy(row.pass_touchdown)) game.touchdowns += 1
      }
    }
    if (truthy(row.rush_attempt)) {
      const rusherId = String(row.rusher_player_id ?? '')
      if (rusherId) {
        const game = line(rusherId, gameId)
        game.carries += 1
        game.rushingYards += numeric(row.yards_gained)
        if (truthy(row.rush_touchdown)) game.touchdowns += 1
      }
    }
  }

  return new Map(Array.from(byPlayer.entries()).map(([playerId, games]) => [playerId, Array.from(games.values()).sort((a, b) => b.gameId.localeCompare(a.gameId))]))
}

function recentAverage(lines: PlayerGameLine[], field: keyof Omit<PlayerGameLine, 'gameId'>, count: number, fallback: number) {
  const sample = lines.slice(0, count)
  return sample.length ? sample.reduce((sum, item) => sum + item[field], 0) / sample.length : fallback
}

function makeProjection(key: SidelineProjection['key'], label: string, baseline: number, recent3: number, recent5: number, observed: number[], matchup: number, pace: number, confidence: number, kind: 'count' | 'yards' | 'probability', unit = ''): SidelineProjection {
  const recentBlend = baseline * .5 + recent3 * .3 + recent5 * .2
  const mean = Math.max(0, kind === 'probability' ? clamp(recentBlend * (1 + (matchup + pace * .5) / 100)) : recentBlend * (1 + (matchup + pace) / 100))
  const range = projectionRange(mean, kind, observed)
  const comparison = kind === 'probability' ? .5 : baseline
  const hitRate = observed.length ? percent(observed.filter(value => value >= comparison).length, observed.length) : 0
  const observedMean = observed.length ? observed.reduce((sum, value) => sum + value, 0) / observed.length : baseline
  const deviation = observed.length ? Math.sqrt(observed.reduce((sum, value) => sum + ((value - observedMean) ** 2), 0) / observed.length) : observedMean
  const stability = clamp(100 - (deviation / Math.max(Math.abs(observedMean), 1)) * 42)
  const sampleQuality = clamp((observed.length / 12) * 100)
  const directionAgreement = Math.sign(recent3 - baseline) === Math.sign(recent5 - baseline) ? 88 : 58
  const calibratedConfidence = confidence * .43 + stability * .24 + sampleQuality * .23 + directionAgreement * .1 - (kind === 'probability' ? 8 : 0)
  return { key, label, mean: round(mean), low: round(range.low), high: round(range.high), unit, matchup: round(matchup), pace: round(pace), confidence: Math.round(clamp(calibratedConfidence, 35, 94)), baseline: round(baseline), recent3: round(recent3), recent5: round(recent5), hitRate }
}

function buildPlayers(receiving: Row[], rushing: Row[], passing: Row[], dvpRows: Row[], pbp: Row[], teams: SidelineGame['home'][], headshots: Map<string, string>): SidelinePlayer[] {
  const playerMap = new Map<string, PlayerAccumulator>()
  const teamTargets = new Map<string, number>()
  const teamCarries = new Map<string, number>()
  const teamGames = new Map<string, Set<string>>()
  const opponents = new Map(teams.map((team, index) => [team.abbr, teams[index === 0 ? 1 : 0]?.abbr ?? '']))
  const dvp = new Map<string, number>()
  const gameLines = buildPlayerGameLines(pbp, teams)
  const pace = new Map<string, number>()

  for (const row of dvpRows) dvp.set(`${String(row.opponent_team)}:${String(row.position)}:${String(row.stat_category)}`, numeric(row.pct_diff))
  for (const row of pbp) {
    const team = String(row.posteam ?? '')
    const gameId = String(row.game_id ?? '')
    if (!team || !gameId || !teams.some(item => item.abbr === team)) continue
    if (!teamGames.has(team)) teamGames.set(team, new Set())
    teamGames.get(team)?.add(gameId)
  }
  for (const team of teams) {
    const offensePlays = pbp.filter(row => row.posteam === team.abbr && (truthy(row.pass_attempt) || truthy(row.rush_attempt))).length
    const opponent = opponents.get(team.abbr) ?? ''
    const opponentDefensePlays = pbp.filter(row => row.defteam === opponent && (truthy(row.pass_attempt) || truthy(row.rush_attempt))).length
    const teamGameCount = Math.max(1, teamGames.get(team.abbr)?.size ?? 0)
    const opponentGames = Math.max(1, new Set(pbp.filter(row => row.defteam === opponent).map(row => String(row.game_id ?? '')).filter(Boolean)).size)
    const expectedPlays = ((offensePlays / teamGameCount) + (opponentDefensePlays / opponentGames)) / 2
    pace.set(team.abbr, clamp(((expectedPlays - 63) / 63) * 100, -8, 8))
  }

  for (const row of receiving) {
    const player = ensurePlayer(playerMap, row, 'receiving')
    if (!player) continue
    player.targets += numeric(row.targets)
    player.receptions += numeric(row.receptions)
    player.receivingYards += numeric(row.yards)
    player.receivingTouchdowns += numeric(row.rec_touchdowns)
    player.airYards = numeric(row.avg_intended_air_yards)
    player.separation = numeric(row.avg_separation)
    player.yacAboveExpected = numeric(row.avg_yac_above_expectation)
    teamTargets.set(player.team, (teamTargets.get(player.team) ?? 0) + numeric(row.targets))
  }

  for (const row of rushing) {
    const player = ensurePlayer(playerMap, row, 'rushing')
    if (!player) continue
    player.carries += numeric(row.rush_attempts)
    player.rushingYards += numeric(row.rush_yards)
    player.rushingTouchdowns += numeric(row.rush_touchdowns)
    player.rushOverExpected = numeric(row.rush_yards_over_expected_per_att)
    teamCarries.set(player.team, (teamCarries.get(player.team) ?? 0) + numeric(row.rush_attempts))
  }

  for (const row of passing) {
    const player = ensurePlayer(playerMap, row, 'passing')
    if (!player) continue
    player.passAttempts += numeric(row.attempts)
    player.completions += numeric(row.completions)
    player.passingYards += numeric(row.pass_yards)
    player.passingTouchdowns += numeric(row.pass_touchdowns)
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
    .filter(player => teams.some(team => team.abbr === player.team) && (player.targets + player.carries >= 8 || player.passAttempts >= 20))
    .map(player => {
      const touches = player.targets + player.carries
      const lines = gameLines.get(player.id) ?? []
      const games = Math.max(1, lines.length || teamGames.get(player.team)?.size || 0)
      const opponent = opponents.get(player.team) ?? ''
      const targetShare = percent(player.targets, teamTargets.get(player.team) ?? 0)
      const carryShare = percent(player.carries, teamCarries.get(player.team) ?? 0)
      const volume = clamp(targetShare * 1.55 + carryShare * .85 + (player.passAttempts ? 20 : 0))
      const geometry = clamp(34 + player.airYards * 2.4 + player.separation * 5 + Math.max(0, player.rushOverExpected) * 12)
      const redZone = clamp(player.redZoneLooks * 7 + player.redZoneScores * 9)
      const breakaway = clamp(28 + player.explosivePlays * 4 + Math.max(0, player.yacAboveExpected) * 9 + Math.max(0, player.rushOverExpected) * 10)
      const evidence = clamp(28 + Math.sqrt(touches + player.passAttempts) * 4.5)
      const index = Math.round(volume * .3 + geometry * .24 + redZone * .18 + breakaway * .16 + evidence * .12)
      const lane = player.position === 'QB' ? 'Passing command' : redZone >= Math.max(volume, geometry, breakaway) ? 'Red-zone role' : geometry >= Math.max(volume, breakaway) ? 'Route geometry' : breakaway > volume ? 'Explosive lane' : 'Volume lane'
      const confidence = clamp(42 + Math.min(games, 17) * 1.8 + Math.sqrt(touches + player.passAttempts) * 1.5, 45, 92)
      const paceAdjustment = pace.get(player.team) ?? 0
      const projections: SidelineProjection[] = []

      if (player.targets > 0) {
        const receptions = player.receptions / games
        const receivingYards = player.receivingYards / games
        projections.push(makeProjection('receptions', 'Receptions', receptions, recentAverage(lines, 'receptions', 3, receptions), recentAverage(lines, 'receptions', 5, receptions), lines.map(item => item.receptions), matchupAdjustment(dvp, opponent, player.position, ['receptions', 'targets']), paceAdjustment, confidence, 'count'))
        projections.push(makeProjection('receiving-yards', 'Receiving yards', receivingYards, recentAverage(lines, 'receivingYards', 3, receivingYards), recentAverage(lines, 'receivingYards', 5, receivingYards), lines.map(item => item.receivingYards), matchupAdjustment(dvp, opponent, player.position, ['receiving_yards']), paceAdjustment, confidence, 'yards', 'yd'))
      }
      if (player.carries > 0) {
        const carries = player.carries / games
        const rushingYards = player.rushingYards / games
        projections.push(makeProjection('rush-attempts', 'Rush attempts', carries, recentAverage(lines, 'carries', 3, carries), recentAverage(lines, 'carries', 5, carries), lines.map(item => item.carries), 0, paceAdjustment, confidence, 'count'))
        projections.push(makeProjection('rushing-yards', 'Rushing yards', rushingYards, recentAverage(lines, 'rushingYards', 3, rushingYards), recentAverage(lines, 'rushingYards', 5, rushingYards), lines.map(item => item.rushingYards), matchupAdjustment(dvp, opponent, player.position, ['rushing_yards']), paceAdjustment, confidence, 'yards', 'yd'))
      }
      if (player.passAttempts > 0) {
        const attempts = player.passAttempts / games
        const completions = player.completions / games
        const passingYards = player.passingYards / games
        projections.push(makeProjection('pass-attempts', 'Pass attempts', attempts, recentAverage(lines, 'passAttempts', 3, attempts), recentAverage(lines, 'passAttempts', 5, attempts), lines.map(item => item.passAttempts), matchupAdjustment(dvp, opponent, 'QB', ['attempts']), paceAdjustment, confidence, 'count'))
        projections.push(makeProjection('completions', 'Completions', completions, recentAverage(lines, 'completions', 3, completions), recentAverage(lines, 'completions', 5, completions), lines.map(item => item.completions), matchupAdjustment(dvp, opponent, 'QB', ['completions']), paceAdjustment, confidence, 'count'))
        projections.push(makeProjection('passing-yards', 'Passing yards', passingYards, recentAverage(lines, 'passingYards', 3, passingYards), recentAverage(lines, 'passingYards', 5, passingYards), lines.map(item => item.passingYards), matchupAdjustment(dvp, opponent, 'QB', ['passing_yards']), paceAdjustment, confidence, 'yards', 'yd'))
      }
      const touchdowns = player.receivingTouchdowns + player.rushingTouchdowns + player.passingTouchdowns
      if (touchdowns > 0 || player.redZoneLooks > 0) {
        const touchdownRate = (1 - Math.exp(-(touchdowns / games))) * 100
        const recent3 = lines.length ? percent(lines.slice(0, 3).filter(item => item.touchdowns > 0).length, Math.min(3, lines.length)) : touchdownRate
        const recent5 = lines.length ? percent(lines.slice(0, 5).filter(item => item.touchdowns > 0).length, Math.min(5, lines.length)) : touchdownRate
        const categories = player.position === 'QB' ? ['passing_tds'] : player.position === 'RB' || player.position === 'FB' ? ['rushing_tds'] : ['receiving_tds']
        projections.push(makeProjection('touchdown', player.position === 'QB' ? 'Passing TD' : 'Touchdown', touchdownRate, recent3, recent5, lines.map(item => item.touchdowns > 0 ? 1 : 0), matchupAdjustment(dvp, opponent, player.position, categories), paceAdjustment, confidence, 'probability', 'chance'))
      }

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
        airYards: round(player.airYards),
        separation: round(player.separation),
        redZoneLooks: player.redZoneLooks,
        lane,
        headshot: player.headshot,
        opponent,
        games,
        projections,
      }
    })
    .sort((a, b) => b.index - a.index)
    .slice(0, 18)
}

function buildTargets(pbp: Row[], teams: SidelineGame['home'][]): SidelineTarget[] {
  return pbp.filter(row => truthy(row.pass_attempt) && String(row.receiver_player_id ?? '') && teams.some(team => team.abbr === row.posteam)).map(row => {
    const location = String(row.pass_location ?? 'middle').toLowerCase()
    const side: SidelineTarget['side'] = location === 'left' || location === 'right' ? location : 'middle'
    const yards = numeric(row.yards_gained)
    return {
      id: `${String(row.game_id)}-${numeric(row.play_id)}`,
      playId: numeric(row.play_id),
      playerId: String(row.receiver_player_id),
      playerName: String(row.receiver_player_name ?? 'Unknown player'),
      team: String(row.posteam ?? ''),
      defense: String(row.defteam ?? ''),
      gameId: String(row.game_id ?? ''),
      homeTeam: String(row.home_team ?? ''),
      awayTeam: String(row.away_team ?? ''),
      quarter: numeric(row.qtr),
      clock: clockLabel(row),
      down: numeric(row.down),
      distance: numeric(row.ydstogo),
      yardline: numeric(row.yardline_100),
      description: String(row.play_desc ?? ''),
      side,
      airYards: numeric(row.air_yards),
      yards,
      yac: numeric(row.yards_after_catch),
      complete: truthy(row.complete_pass),
      touchdown: truthy(row.pass_touchdown) || truthy(row.touchdown),
      explosive: yards >= 20,
    }
  })
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
  const [pbpResult, receivingResult, rushingResult, passingResult, dvpResult] = await Promise.all([
    admin
      .from('nfl_pbp')
      .select('game_id,play_id,home_team,away_team,posteam,defteam,qtr,quarter_seconds_remaining,down,ydstogo,yards_gained,score_differential,yardline_100,play_desc,shotgun,no_huddle,qb_dropback,pass_attempt,rush_attempt,complete_pass,success,touchdown,pass_touchdown,rush_touchdown,air_yards,yards_after_catch,pass_location,passer_player_id,passer_player_name,receiver_player_id,receiver_player_name,rusher_player_id,rusher_player_name')
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
    admin
      .from('nfl_ngs_passing')
      .select('player_gsis_id,player_display_name,player_short_name,player_position,team_abbr,attempts,completions,pass_yards,pass_touchdowns')
      .eq('season', season)
      .eq('week', 0)
      .eq('season_type', 'REG')
      .in('team_abbr', teams),
    admin
      .from('nfl_dvp')
      .select('position,opponent_team,stat_category,pct_diff,games')
      .eq('season', season)
      .in('opponent_team', teams),
  ])

  return {
    pbp: (pbpResult.data ?? []) as Row[],
    receiving: (receivingResult.data ?? []) as Row[],
    rushing: (rushingResult.data ?? []) as Row[],
    passing: (passingResult.data ?? []) as Row[],
    dvp: (dvpResult.data ?? []) as Row[],
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
    const matchupPlayerIds = Array.from(new Set([...data.receiving, ...data.rushing, ...data.passing].map(row => nullableText(row.player_gsis_id)).filter((id): id is string => Boolean(id))))
    const matchupHeadshots = await queryHeadshots(matchupPlayerIds)
    const players = buildPlayers(data.receiving, data.rushing, data.passing, data.dvp, data.pbp, [game.away, game.home], matchupHeadshots)
    const targets = buildTargets(data.pbp, [game.away, game.home])
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
      targets,
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
      targets: [],
    }
  }
}
