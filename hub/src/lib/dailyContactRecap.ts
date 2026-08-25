import 'server-only'

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchHrFeed, type MlbContactFeedEvent } from '@/lib/hrFeed'
import { fetchMlbPartyRows } from '@/lib/mlbPartyServer'
import { getMLBSchedule, type MLBGame } from '@slipsurge/core/mlb-api'
import { mlbTeamAbbrById } from '@slipsurge/core/mlbTeams'
import { normName } from '@slipsurge/core/nameNorm'
import { resolveBattedBallDistance } from '@slipsurge/core/battedBallDistance'
import type { ContactKind, DailyContactEvent, DailyContactGame, DailyContactSlate } from '@/lib/contactRecapTypes'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SPECIAL_VENUES = new Set([5340, 5355, 5445])
const CONTACT_PAGE_SIZE = 1000
const PITCH_SELECT = [
  'game_pk', 'game_date', 'pitcher_id', 'batter_id', 'pitch_type', 'events', 'description',
  'is_in_play', 'is_home_run', 'launch_speed', 'launch_angle', 'hc_x', 'hc_y', 'hit_distance',
  'bb_type', 'inning', 'at_bat_index', 'pitch_number', 'velocity',
].join(', ')

type PitchRow = {
  game_pk: number | string
  game_date: string
  pitcher_id: number | null
  batter_id: number
  pitch_type: string | null
  events: string | null
  description: string | null
  is_in_play: boolean
  is_home_run: boolean
  launch_speed: number | null
  launch_angle: number | null
  hc_x: number | null
  hc_y: number | null
  hit_distance: number | null
  bb_type: string | null
  inning: number | null
  at_bat_index: number | null
  pitch_number: number | null
  velocity: number | null
}

type NearHrRow = {
  game_pk: number | null
  game_date: string
  batter_name: string
  batter_id: number
  pitcher_name: string | null
  pitcher_id?: number | null
  pitch_type: string | null
  pitch_speed: number | null
  result: string | null
  inning: number | null
  half_inning: string | null
  exit_velocity: number | null
  launch_angle: number | null
  hit_distance: number | null
  hit_bearing: number | null
  parks_hr_count: number | null
  park_hr_list: string | null
  home_team: string | null
  away_team: string | null
  captured_at: string | null
}

type PlayerRow = { mlb_id: number; full_name: string | null; current_team_abbr: string | null }

function canonicalAbbr(value?: string | null) {
  const upper = (value ?? '').toUpperCase()
  return ({ AZ: 'ARI', OAK: 'ATH', CHW: 'CWS', KCR: 'KC', SDP: 'SD', SFG: 'SF', TBR: 'TB', WSN: 'WSH' } as Record<string, string>)[upper] ?? upper
}

function gameFromSchedule(game: MLBGame, gameIndex: number): DailyContactGame {
  const homeId = game.teams.home.team.id
  const awayId = game.teams.away.team.id
  const venueId = game.venue?.id ?? null
  const homeTeam = canonicalAbbr(game.teams.home.team.abbreviation ?? mlbTeamAbbrById(homeId))
  const awayTeam = canonicalAbbr(game.teams.away.team.abbreviation ?? mlbTeamAbbrById(awayId))
  return {
    gamePk: game.gamePk,
    gameIndex,
    gameDate: game.gameDate,
    startTime: game.gameDate,
    status: game.status.detailedState,
    venueId,
    venueName: game.venue?.name ?? 'MLB ballpark',
    // Neutral and showcase venues must never borrow the nominal home
    // club's field outline or watermark. The generic MLB field is honest
    // until an exact venue trace is available.
    parkTeamAbbr: venueId != null && SPECIAL_VENUES.has(venueId) ? 'MLB' : homeTeam,
    homeTeamId: homeId,
    homeTeam,
    homeName: game.teams.home.team.name,
    homeScore: game.teams.home.score ?? null,
    awayTeamId: awayId,
    awayTeam,
    awayName: game.teams.away.team.name,
    awayScore: game.teams.away.score ?? null,
  }
}

function sameMetricValues(values: { exitVelocity: number | null; launchAngle: number | null; distance: number | null }, detail: { exit_velocity: number | null; launch_angle: number | null; hit_distance: number | null }) {
  const comparisons = [
    [values.exitVelocity, detail.exit_velocity, 0.35],
    [values.launchAngle, detail.launch_angle, 0.5],
    [values.distance, detail.hit_distance, 3],
  ].filter(([left, right]) => left != null && right != null)
  return comparisons.length >= 2 && comparisons.every(([left, right, tolerance]) => Math.abs(Number(left) - Number(right)) <= Number(tolerance))
}

function sameMetrics(pitch: PitchRow, detail: { exit_velocity: number | null; launch_angle: number | null; hit_distance: number | null }) {
  return sameMetricValues({ exitVelocity: pitch.launch_speed, launchAngle: pitch.launch_angle, distance: pitch.hit_distance }, detail)
}

function projectedCoordinate(bearing: number | null, distance: number | null) {
  const angle = (Number(bearing ?? 0) * Math.PI) / 180
  const radius = Math.max(46, Math.min(174, Number(distance ?? 330) * 0.42))
  return {
    x: Math.max(20, Math.min(230, 125 + Math.sin(angle) * radius)),
    y: Math.max(28, Math.min(202, 203 - Math.cos(angle) * radius)),
  }
}

function resultKind(row: PitchRow, near: NearHrRow | null): ContactKind {
  if (row.is_home_run || row.events === 'home_run') return 'home_run'
  if (near) return 'near_hr'
  if (['single', 'double', 'triple'].includes(row.events ?? '')) return 'hit'
  if (['field_out', 'force_out', 'fielders_choice_out', 'grounded_into_double_play', 'double_play', 'triple_play', 'sac_bunt', 'sac_fly'].includes(row.events ?? '')) return 'out'
  return 'other'
}

function liveResultKind(row: MlbContactFeedEvent): ContactKind {
  if (row.event_type === 'home_run') return 'home_run'
  if (['single', 'double', 'triple'].includes(row.event_type)) return 'hit'
  if (['field_out', 'force_out', 'fielders_choice_out', 'grounded_into_double_play', 'double_play', 'triple_play', 'sac_bunt', 'sac_fly'].includes(row.event_type)) return 'out'
  return 'other'
}

function contactKey(gamePk: number, batterId: number, atBatIndex: number) {
  return `${gamePk}:${batterId}:${atBatIndex}`
}

function eventId(gamePk: number, batterId: number, atBatIndex: number, pitchNumber: number) {
  return `${gamePk}:${batterId}:${atBatIndex}:${pitchNumber}`
}

function eventSort(a: DailyContactEvent, b: DailyContactEvent) {
  return a.game.gameIndex - b.game.gameIndex || a.atBatIndex - b.atBatIndex || a.pitchNumber - b.pitchNumber
}

const loadCached = unstable_cache(async (date: string): Promise<DailyContactSlate> => {
  const [schedule, nearRows] = await Promise.all([
    getMLBSchedule(date),
    fetchMlbPartyRows<NearHrRow>(
      `/rest/v1/near_hrs?game_date=eq.${encodeURIComponent(date)}&select=game_pk,game_date,batter_name,batter_id,pitcher_name,pitch_type,pitch_speed,result,inning,half_inning,exit_velocity,launch_angle,hit_distance,hit_bearing,parks_hr_count,park_hr_list,home_team,away_team,captured_at&order=captured_at.asc&limit=500`,
      { maxRows: 500, revalidateSeconds: 30 },
    ).catch(() => []),
  ])
  const games = schedule.slice().sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.gamePk - b.gamePk).map(gameFromSchedule)
  const gameByPk = new Map(games.map(game => [game.gamePk, game]))
  const admin = createAdminClient()
  // PostgREST caps a response at 1,000 rows even when a larger limit is
  // requested. Large slates and extra-inning games can exceed that ceiling,
  // so page the complete date deterministically instead of silently dropping
  // late games from Contact Recap and exported media.
  const pitchRows: PitchRow[] = []
  for (let from = 0; ; from += CONTACT_PAGE_SIZE) {
    const { data: pitchData, error: pitchError } = await admin
      .from('player_pitch_log')
      .select(PITCH_SELECT)
      .eq('game_date', date)
      .eq('is_in_play', true)
      .order('game_pk', { ascending: true })
      .order('at_bat_index', { ascending: true })
      .order('pitch_number', { ascending: true })
      .range(from, from + CONTACT_PAGE_SIZE - 1)
    if (pitchError) throw pitchError
    const page = (pitchData ?? []) as unknown as PitchRow[]
    pitchRows.push(...page)
    if (page.length < CONTACT_PAGE_SIZE) break
  }

  const hrResult = await fetchHrFeed(schedule)
  const ids = new Set<number>()
  pitchRows.forEach(row => { ids.add(Number(row.batter_id)); if (row.pitcher_id) ids.add(Number(row.pitcher_id)) })
  nearRows.forEach(row => { if (row.batter_id) ids.add(Number(row.batter_id)); if (row.pitcher_id) ids.add(Number(row.pitcher_id)) })
  hrResult.hrFeed.forEach(row => { if (row.mlb_id) ids.add(row.mlb_id); if (row.pitcher_mlb_id) ids.add(row.pitcher_mlb_id) })
  hrResult.contactFeed.forEach(row => { if (row.batter_mlb_id) ids.add(row.batter_mlb_id); if (row.pitcher_mlb_id) ids.add(row.pitcher_mlb_id) })
  const { data: playersData } = ids.size
    ? await admin.from('players').select('mlb_id,full_name,current_team_abbr').in('mlb_id', Array.from(ids))
    : { data: [] as PlayerRow[] }
  const players = new Map(((playersData ?? []) as PlayerRow[]).map(player => [Number(player.mlb_id), player]))

  const usedNear = new Set<number>()
  const contacts: DailyContactEvent[] = []
  for (const row of pitchRows) {
    const gamePk = Number(row.game_pk)
    const game = gameByPk.get(gamePk)
    if (!game || row.hc_x == null || row.hc_y == null) continue
    const nearIndex = nearRows.findIndex((candidate, index) => !usedNear.has(index)
      && Number(candidate.batter_id) === Number(row.batter_id)
      && (!candidate.game_pk || Number(candidate.game_pk) === gamePk)
      && sameMetrics(row, candidate))
    const near = nearIndex >= 0 ? nearRows[nearIndex] : null
    if (nearIndex >= 0) usedNear.add(nearIndex)
    const hr = hrResult.hrFeed.find(candidate => Number(candidate.game_pk) === gamePk
      && Number(candidate.mlb_id) === Number(row.batter_id)
      && (candidate.ab_index === Number(row.at_bat_index ?? -1) || sameMetrics(row, {
        exit_velocity: candidate.exit_velocity,
        launch_angle: candidate.launch_angle,
        hit_distance: candidate.hit_distance,
      }))) ?? null
    const batter = players.get(Number(row.batter_id))
    const pitcher = row.pitcher_id ? players.get(Number(row.pitcher_id)) : null
    const batterTeam = canonicalAbbr(batter?.current_team_abbr)
    const resolvedBatterTeam = [game.homeTeam, game.awayTeam].includes(batterTeam) ? batterTeam : game.awayTeam
    const pitcherTeam = resolvedBatterTeam === game.homeTeam ? game.awayTeam : game.homeTeam
    contacts.push({
      id: eventId(gamePk, Number(row.batter_id), Number(row.at_bat_index ?? 0), Number(row.pitch_number ?? 0)),
      kind: resultKind(row, near), gamePk, gameIndex: game.gameIndex, gameDate: date,
      eventTime: hr?.hr_time ?? near?.captured_at ?? null,
      atBatIndex: Number(row.at_bat_index ?? 0), plateAppearanceNumber: hr?.batter_pa_number ?? null,
      pitchNumber: Number(row.pitch_number ?? 0),
      batterId: Number(row.batter_id), batterName: batter?.full_name ?? near?.batter_name ?? hr?.player_name ?? `Player ${row.batter_id}`,
      batterTeam: resolvedBatterTeam,
      pitcherId: row.pitcher_id ? Number(row.pitcher_id) : hr?.pitcher_mlb_id ?? null,
      pitcherName: pitcher?.full_name ?? near?.pitcher_name ?? hr?.pitcher_name ?? 'Pitcher', pitcherTeam,
      inning: row.inning ?? hr?.inning ?? near?.inning ?? null, half: hr?.half ?? near?.half_inning ?? '',
      result: row.events ?? near?.result ?? (row.is_home_run ? 'home_run' : 'ball_in_play'),
      description: hr?.desc ?? row.description ?? near?.result ?? '', rbi: hr?.rbi_on_play ?? 0,
      isFirstHr: hr?.is_first_hr_of_game ?? false, isGrandSlam: hr?.is_grand_slam ?? false,
      exitVelocity: row.launch_speed ?? hr?.exit_velocity ?? near?.exit_velocity ?? null,
      launchAngle: row.launch_angle ?? hr?.launch_angle ?? near?.launch_angle ?? null,
      distance: resolveBattedBallDistance(row).feet ?? hr?.hit_distance ?? near?.hit_distance ?? null,
      hitBearing: near?.hit_bearing ?? null, hcX: Number(row.hc_x), hcY: Number(row.hc_y), coordinateSource: 'statcast',
      pitchType: row.pitch_type ?? near?.pitch_type ?? null, pitchSpeed: row.velocity ?? near?.pitch_speed ?? null,
      bbType: row.bb_type ?? null, parksHrCount: near?.parks_hr_count ?? null, parkHrList: near?.park_hr_list ?? null,
      game,
    })
  }

  // player_pitch_log is the postgame Savant source of truth. MLB Gameday
  // supplies official fair-ball coordinates during live and just-completed
  // games. Merge only plate appearances absent from Savant so the historical
  // row automatically takes precedence once the daily sync lands.
  const existingContactKeys = new Set(contacts.map(row => contactKey(row.gamePk, row.batterId, row.atBatIndex)))
  for (const live of hrResult.contactFeed) {
    if (!live.batter_mlb_id || live.hc_x == null || live.hc_y == null) continue
    const key = contactKey(live.game_pk, live.batter_mlb_id, live.ab_index)
    if (existingContactKeys.has(key)) continue
    const game = gameByPk.get(live.game_pk)
    if (!game) continue
    const batter = players.get(live.batter_mlb_id)
    const pitcher = live.pitcher_mlb_id ? players.get(live.pitcher_mlb_id) : null
    const batterTeam = (live.half ?? '').toLowerCase().startsWith('top') ? game.awayTeam : game.homeTeam
    const hr = hrResult.hrFeed.find(candidate => candidate.game_pk === live.game_pk && candidate.ab_index === live.ab_index) ?? null
    const nearIndex = nearRows.findIndex((candidate, index) => !usedNear.has(index)
      && Number(candidate.batter_id) === live.batter_mlb_id
      && (!candidate.game_pk || Number(candidate.game_pk) === live.game_pk)
      && sameMetricValues({ exitVelocity: live.exit_velocity, launchAngle: live.launch_angle, distance: live.hit_distance }, candidate))
    const near = nearIndex >= 0 ? nearRows[nearIndex] : null
    if (nearIndex >= 0) usedNear.add(nearIndex)
    contacts.push({
      id: eventId(live.game_pk, live.batter_mlb_id, live.ab_index, live.pitch_number),
      kind: near ? 'near_hr' : liveResultKind(live), gamePk: live.game_pk, gameIndex: game.gameIndex, gameDate: date,
      eventTime: live.event_time, atBatIndex: live.ab_index, plateAppearanceNumber: hr?.batter_pa_number ?? null,
      pitchNumber: live.pitch_number,
      batterId: live.batter_mlb_id, batterName: batter?.full_name ?? live.batter_name ?? `Player ${live.batter_mlb_id}`,
      batterTeam, pitcherId: live.pitcher_mlb_id, pitcherName: pitcher?.full_name ?? live.pitcher_name ?? 'Pitcher',
      pitcherTeam: batterTeam === game.homeTeam ? game.awayTeam : game.homeTeam,
      inning: live.inning ?? null, half: live.half ?? '', result: live.event_type, description: live.desc,
      rbi: live.rbi_on_play, isFirstHr: hr?.is_first_hr_of_game ?? false, isGrandSlam: hr?.is_grand_slam ?? false,
      exitVelocity: live.exit_velocity, launchAngle: live.launch_angle, distance: resolveBattedBallDistance({ hit_distance: live.hit_distance, hc_x: live.hc_x, hc_y: live.hc_y }).feet, hitBearing: near?.hit_bearing ?? null,
      hcX: live.hc_x, hcY: live.hc_y, coordinateSource: 'mlb_live', pitchType: live.pitch_type,
      pitchSpeed: live.pitch_speed, bbType: live.bb_type, parksHrCount: near?.parks_hr_count ?? null, parkHrList: near?.park_hr_list ?? null, game,
    })
    existingContactKeys.add(key)
  }

  // Current-day official HR and near-HR results can arrive before the
  // daily Savant pitch-log sync. Preserve the recap immediately instead of
  // showing an empty slate, while keeping projected near-HR coordinates
  // explicitly distinguishable from official Statcast coordinates.
  const existingHrKeys = new Set(contacts.filter(row => row.kind === 'home_run').map(row => `${row.gamePk}:${row.batterId}:${row.atBatIndex}`))
  for (const hr of hrResult.hrFeed) {
    if (!hr.mlb_id || existingHrKeys.has(`${hr.game_pk}:${hr.mlb_id}:${hr.ab_index}`)) continue
    const game = gameByPk.get(hr.game_pk)
    if (!game) continue
    const point = hr.hc_x != null && hr.hc_y != null ? { x: hr.hc_x, y: hr.hc_y } : projectedCoordinate(null, hr.hit_distance)
    const batterTeam = (hr.half ?? '').toLowerCase().startsWith('top') ? game.awayTeam : game.homeTeam
    contacts.push({
      id: eventId(hr.game_pk, hr.mlb_id, hr.ab_index, 0), kind: 'home_run', gamePk: hr.game_pk, gameIndex: game.gameIndex,
      gameDate: date, eventTime: hr.hr_time, atBatIndex: hr.ab_index, plateAppearanceNumber: hr.batter_pa_number,
      pitchNumber: 0,
      batterId: hr.mlb_id, batterName: hr.player_name, batterTeam,
      pitcherId: hr.pitcher_mlb_id, pitcherName: hr.pitcher_name ?? 'Pitcher', pitcherTeam: batterTeam === game.homeTeam ? game.awayTeam : game.homeTeam,
      inning: hr.inning ?? null, half: hr.half ?? '', result: 'home_run', description: hr.desc, rbi: hr.rbi_on_play,
      isFirstHr: hr.is_first_hr_of_game, isGrandSlam: hr.is_grand_slam, exitVelocity: hr.exit_velocity,
      launchAngle: hr.launch_angle, distance: hr.hit_distance, hitBearing: null, hcX: point.x, hcY: point.y,
      coordinateSource: hr.hc_x != null && hr.hc_y != null ? 'statcast' : 'bearing_projection', pitchType: null,
      pitchSpeed: null, bbType: 'fly_ball', parksHrCount: null, parkHrList: null, game,
    })
  }

  nearRows.forEach((near, index) => {
    if (usedNear.has(index)) return
    const game = (near.game_pk ? gameByPk.get(Number(near.game_pk)) : null)
      ?? games.find(candidate => [candidate.homeTeam, candidate.awayTeam].includes(canonicalAbbr(near.home_team)) && [candidate.homeTeam, candidate.awayTeam].includes(canonicalAbbr(near.away_team)))
    if (!game || !near.batter_id) return
    const point = projectedCoordinate(near.hit_bearing, near.hit_distance)
    const batterTeam = (near.half_inning ?? '').toLowerCase().startsWith('top') ? game.awayTeam : game.homeTeam
    contacts.push({
      id: eventId(game.gamePk, near.batter_id, 9000 + index, 0), kind: 'near_hr', gamePk: game.gamePk, gameIndex: game.gameIndex,
      gameDate: date, eventTime: near.captured_at, atBatIndex: 9000 + index, plateAppearanceNumber: null,
      pitchNumber: 0,
      batterId: near.batter_id, batterName: near.batter_name, batterTeam,
      pitcherId: near.pitcher_id ?? hrResult.pitcherIdByName[normName(near.pitcher_name ?? '')] ?? null,
      pitcherName: near.pitcher_name ?? 'Pitcher', pitcherTeam: batterTeam === game.homeTeam ? game.awayTeam : game.homeTeam,
      inning: near.inning, half: near.half_inning ?? '', result: near.result ?? 'near_home_run', description: near.result ?? '', rbi: 0,
      isFirstHr: false, isGrandSlam: false, exitVelocity: near.exit_velocity, launchAngle: near.launch_angle,
      distance: near.hit_distance, hitBearing: near.hit_bearing, hcX: point.x, hcY: point.y, coordinateSource: 'bearing_projection',
      pitchType: near.pitch_type, pitchSpeed: near.pitch_speed, bbType: 'fly_ball', parksHrCount: near.parks_hr_count,
      parkHrList: near.park_hr_list, game,
    })
  })

  contacts.sort(eventSort)
  const homeRuns = contacts.filter(row => row.kind === 'home_run')
  const nearHomeRuns = contacts.filter(row => row.kind === 'near_hr')
  return {
    date, generatedAt: new Date().toISOString(), games, contacts, homeRuns, nearHomeRuns,
    dataNotes: [
      'Home runs use official MLB play-by-play and Statcast measurements.',
      'Official hc_x/hc_y coordinates are used whenever captured.',
      'When projected distance is absent, a coordinate-derived distance is shown as an estimate.',
      'Live and recently completed games merge official MLB Gameday contact until the postgame Savant sync is available.',
      'Unsynced near-home-run points use the recorded Statcast bearing and distance and are labeled as projections.',
    ],
  }
}, ['daily-contact-recap'], { revalidate: 30, tags: ['daily-contact-recap', 'player-pitch-log'] })

export async function getDailyContactRecap(date: string) {
  if (!DATE_RE.test(date)) throw new Error('Pass a valid YYYY-MM-DD date.')
  return loadCached(date)
}
