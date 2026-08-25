import 'server-only'

import { resolveBattedBallDistance } from '@slipsurge/core/battedBallDistance'
import { getTeamName } from '@slipsurge/core/mlbTeamColors'
import type { TodayGame } from '@slipsurge/core/mlbSchedule'
import type { HrFeedEvent, MlbContactFeedEvent } from '@/lib/hrFeed'
import type { CoordinateSource, DailyContactEvent, DailyContactGame } from '@/lib/contactRecapTypes'

const SPECIAL_VENUES = new Set([5340, 5355, 5445])

export type NearHrSourceRow = {
  id?: number | string | null
  game_pk?: number | string | null
  game_date?: string | null
  play_id?: string | null
  batter_name: string
  batter_id?: number | string | null
  pitcher_name?: string | null
  pitch_type?: string | null
  pitch_speed?: number | string | null
  result?: string | null
  inning?: number | string | null
  half_inning?: string | null
  exit_velocity?: number | string | null
  launch_angle?: number | string | null
  hit_distance?: number | string | null
  hit_bearing?: number | string | null
  parks_hr_count?: number | string | null
  park_hr_list?: string | null
  home_team?: string | null
  away_team?: string | null
  captured_at?: string | null
}

function finite(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeHalf(value: string | null | undefined) {
  return String(value ?? '').toLowerCase().startsWith('b') ? 'bottom' : 'top'
}

function projectedCoordinate(bearing: number | null, distance: number | null) {
  const angle = (Number(bearing ?? 0) * Math.PI) / 180
  const radius = Math.max(46, Math.min(174, Number(distance ?? 330) * 0.42))
  return {
    x: Math.max(20, Math.min(230, 125 + Math.sin(angle) * radius)),
    y: Math.max(28, Math.min(202, 203 - Math.cos(angle) * radius)),
  }
}
function alertGame(game: TodayGame, gameIndex: number, date: string): DailyContactGame {
  return {
    gamePk: game.gamePk,
    gameIndex,
    gameDate: date,
    startTime: game.gameDate,
    status: game.status,
    venueId: game.venueId ?? null,
    venueName: game.venueName ?? 'MLB ballpark',
    parkTeamAbbr: game.venueId != null && SPECIAL_VENUES.has(game.venueId) ? 'MLB' : game.homeAbbr,
    homeTeamId: game.homeTeamId ?? 0,
    homeTeam: game.homeAbbr,
    homeName: game.homeTeam || getTeamName(game.homeAbbr),
    homeScore: game.homeScore,
    awayTeamId: game.awayTeamId ?? 0,
    awayTeam: game.awayAbbr,
    awayName: game.awayTeam || getTeamName(game.awayAbbr),
    awayScore: game.awayScore,
  }
}

function exactContactForHr(hr: HrFeedEvent, contacts: MlbContactFeedEvent[]) {
  return contacts.find(contact => contact.game_pk === hr.game_pk && contact.ab_index === hr.ab_index)
}

export function homeRunAlertEvent(
  hr: HrFeedEvent,
  game: TodayGame,
  gameIndex: number,
  date: string,
  contacts: MlbContactFeedEvent[],
): DailyContactEvent {
  const contact = exactContactForHr(hr, contacts)
  const half = normalizeHalf(hr.half)
  const batterTeam = half === 'bottom' ? game.homeAbbr : game.awayAbbr
  const pitcherTeam = half === 'bottom' ? game.awayAbbr : game.homeAbbr
  const exactX = finite(contact?.hc_x ?? hr.hc_x)
  const exactY = finite(contact?.hc_y ?? hr.hc_y)
  const resolvedDistance = resolveBattedBallDistance({
    hit_distance: hr.hit_distance ?? contact?.hit_distance,
    hc_x: exactX,
    hc_y: exactY,
  })
  const projected = projectedCoordinate(null, resolvedDistance.feet)
  const coordinateSource: CoordinateSource = exactX != null && exactY != null ? 'mlb_live' : 'bearing_projection'
  const batterId = Number(hr.mlb_id ?? contact?.batter_mlb_id ?? 0)
  const pitchNumber = Number(contact?.pitch_number ?? 0)
  return {
    id: `${game.gamePk}:${batterId}:${hr.ab_index}:${pitchNumber}`,
    kind: 'home_run',
    gamePk: game.gamePk,
    gameIndex,
    gameDate: date,
    eventTime: hr.hr_time ?? contact?.event_time ?? null,
    atBatIndex: hr.ab_index,
    plateAppearanceNumber: hr.batter_pa_number || null,
    pitchNumber,
    batterId,
    batterName: hr.player_name,
    batterTeam,
    pitcherId: hr.pitcher_mlb_id ?? contact?.pitcher_mlb_id ?? null,
    pitcherName: hr.pitcher_name ?? contact?.pitcher_name ?? 'MLB pitcher',
    pitcherTeam,
    inning: hr.inning ?? contact?.inning ?? null,
    half,
    result: 'home_run',
    description: hr.desc,
    rbi: Math.max(1, hr.rbi_on_play),
    isFirstHr: hr.is_first_hr_of_game,
    isGrandSlam: hr.is_grand_slam,
    exitVelocity: hr.exit_velocity ?? contact?.exit_velocity ?? null,
    launchAngle: hr.launch_angle ?? contact?.launch_angle ?? null,
    distance: resolvedDistance.feet,
    hitBearing: null,
    hcX: exactX ?? projected.x,
    hcY: exactY ?? projected.y,
    coordinateSource,
    pitchType: contact?.pitch_type ?? null,
    pitchSpeed: contact?.pitch_speed ?? null,
    bbType: contact?.bb_type ?? null,
    parksHrCount: null,
    parkHrList: null,
    game: alertGame(game, gameIndex, date),
  }
}

function nearGame(row: NearHrSourceRow, games: TodayGame[]) {
  const gamePk = finite(row.game_pk)
  if (gamePk != null) {
    const index = games.findIndex(game => game.gamePk === gamePk)
    if (index >= 0) return { game: games[index], gameIndex: index }
  }
  const batterId = finite(row.batter_id)
  const index = games.findIndex(game => [...game.homeLineup, ...game.awayLineup].some(player => player.mlb_id === batterId))
  if (index >= 0) return { game: games[index], gameIndex: index }
  const home = String(row.home_team ?? '').toUpperCase()
  const away = String(row.away_team ?? '').toUpperCase()
  const teamIndex = games.findIndex(game => game.homeAbbr === home && game.awayAbbr === away)
  return teamIndex >= 0 ? { game: games[teamIndex], gameIndex: teamIndex } : null
}

function nearContact(row: NearHrSourceRow, gamePk: number, contacts: MlbContactFeedEvent[]) {
  const batterId = finite(row.batter_id)
  const candidates = contacts.filter(contact => contact.game_pk === gamePk && (
    (batterId != null && contact.batter_mlb_id === batterId)
    || contact.batter_name.toLowerCase() === row.batter_name.toLowerCase()
  ))
  const exitVelocity = finite(row.exit_velocity)
  const launchAngle = finite(row.launch_angle)
  const distance = finite(row.hit_distance)
  return candidates.find(contact => {
    const comparisons = [
      [exitVelocity, contact.exit_velocity, .5],
      [launchAngle, contact.launch_angle, .75],
      [distance, contact.hit_distance, 4],
    ].filter(([left, right]) => left != null && right != null)
    return comparisons.length >= 2 && comparisons.every(([left, right, tolerance]) => Math.abs(Number(left) - Number(right)) <= Number(tolerance))
  }) ?? candidates.at(-1) ?? null
}

export function nearHomeRunAlertEvent(
  row: NearHrSourceRow,
  games: TodayGame[],
  date: string,
  contacts: MlbContactFeedEvent[],
): DailyContactEvent | null {
  const match = nearGame(row, games)
  if (!match) return null
  const { game, gameIndex } = match
  const contact = nearContact(row, game.gamePk, contacts)
  const half = normalizeHalf(row.half_inning ?? contact?.half)
  const batterTeam = half === 'bottom' ? game.homeAbbr : game.awayAbbr
  const pitcherTeam = half === 'bottom' ? game.awayAbbr : game.homeAbbr
  const bearing = finite(row.hit_bearing)
  const exactX = finite(contact?.hc_x)
  const exactY = finite(contact?.hc_y)
  const distance = resolveBattedBallDistance({
    hit_distance: finite(row.hit_distance) ?? contact?.hit_distance,
    hc_x: exactX,
    hc_y: exactY,
  }).feet
  const projected = projectedCoordinate(bearing, distance)
  const batterId = Number(finite(row.batter_id) ?? contact?.batter_mlb_id ?? 0)
  // If MLB has published the play, its game/AB/pitch tuple is canonical. A
  // scraper timestamp is retained only as an idempotent source fallback.
  const capturedAt = row.captured_at ?? new Date().toISOString()
  const fallbackIndex = Math.floor(new Date(capturedAt).getTime() / 1000)
  const atBatIndex = Number(contact?.ab_index ?? fallbackIndex)
  const pitchNumber = Number(contact?.pitch_number ?? 0)
  return {
    id: `${game.gamePk}:${batterId}:${atBatIndex}:${pitchNumber}`,
    kind: 'near_hr',
    gamePk: game.gamePk,
    gameIndex,
    gameDate: date,
    eventTime: contact?.event_time ?? capturedAt,
    atBatIndex,
    plateAppearanceNumber: null,
    pitchNumber,
    batterId,
    batterName: row.batter_name,
    batterTeam,
    pitcherId: contact?.pitcher_mlb_id ?? null,
    pitcherName: row.pitcher_name ?? contact?.pitcher_name ?? 'MLB pitcher',
    pitcherTeam,
    inning: finite(row.inning) ?? contact?.inning ?? null,
    half,
    result: row.result ?? contact?.event_type ?? 'near_home_run',
    description: contact?.desc ?? 'Near home run',
    rbi: Math.max(0, contact?.rbi_on_play ?? 0),
    isFirstHr: false,
    isGrandSlam: false,
    exitVelocity: finite(row.exit_velocity) ?? contact?.exit_velocity ?? null,
    launchAngle: finite(row.launch_angle) ?? contact?.launch_angle ?? null,
    distance,
    hitBearing: bearing,
    hcX: exactX ?? projected.x,
    hcY: exactY ?? projected.y,
    coordinateSource: exactX != null && exactY != null ? 'mlb_live' : 'bearing_projection',
    pitchType: row.pitch_type ?? contact?.pitch_type ?? null,
    pitchSpeed: finite(row.pitch_speed) ?? contact?.pitch_speed ?? null,
    bbType: contact?.bb_type ?? null,
    parksHrCount: finite(row.parks_hr_count),
    parkHrList: row.park_hr_list ?? null,
    game: alertGame(game, gameIndex, date),
  }
}
