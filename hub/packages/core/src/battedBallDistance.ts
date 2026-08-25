export type BattedBallDistanceInput = {
  hit_distance?: number | string | null
  hc_x?: number | string | null
  hc_y?: number | string | null
}

export type BattedBallDistance = {
  feet: number | null
  source: 'statcast' | 'coordinate_estimate' | 'unavailable'
}

const STATCAST_HOME_X = 125.42
const STATCAST_HOME_Y = 198.27
const FEET_PER_CHART_UNIT = 2.5

function finite(value: number | string | null | undefined) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function validFeet(value: number | null) {
  return value != null && value >= 0 && value <= 600
}

/** Resolve one display distance for a tracked batted ball. */
export function resolveBattedBallDistance(row: BattedBallDistanceInput): BattedBallDistance {
  const official = finite(row.hit_distance)
  if (validFeet(official)) return { feet: official, source: 'statcast' }

  const hcX = finite(row.hc_x)
  const hcY = finite(row.hc_y)
  if (hcX == null || hcY == null || (hcX === 0 && hcY === 0)) {
    return { feet: null, source: 'unavailable' }
  }

  const xFeet = FEET_PER_CHART_UNIT * (hcX - STATCAST_HOME_X)
  const yFeet = FEET_PER_CHART_UNIT * (STATCAST_HOME_Y - hcY)
  const estimated = Math.hypot(xFeet, yFeet)
  return validFeet(estimated)
    ? { feet: estimated, source: 'coordinate_estimate' }
    : { feet: null, source: 'unavailable' }
}

export function formatBattedBallDistance(
  row: BattedBallDistanceInput,
  options: { suffix?: boolean; unavailable?: string } = {},
) {
  const distance = resolveBattedBallDistance(row)
  if (distance.feet == null) return options.unavailable ?? '\u2014'
  const prefix = distance.source === 'coordinate_estimate' ? '\u2248' : ''
  return `${prefix}${Math.round(distance.feet)}${options.suffix === false ? '' : ' ft'}`
}
