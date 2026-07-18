// Static MLB ballpark reference data, keyed by home team abbreviation —
// used to geocode each game for weather lookups without hitting a geocoding
// API on every request. Coordinates are approximate (home plate area),
// accurate enough for hourly forecast purposes.
export type ParkRoof = 'open' | 'retractable' | 'dome'

export interface ParkInfo {
  name: string
  city: string
  lat: number
  lon: number
  roof: ParkRoof
  // Compass bearing (degrees, 0=N clockwise) from home plate toward center
  // field. Needed to tell "blowing out" from "blowing in" — a due-east wind
  // means very different things at a park facing NE vs one facing SW.
  // Approximate published orientations, not surveyed values; good enough
  // for an at-a-glance heat read, not a precise carry model.
  orientationDeg: number
}

// MLB's own schedule API isn't stable about which abbreviation it returns
// for a handful of teams — confirmed directly in the Dugout data route
// (see TEAM_ABBR_ALIASES in src/app/api/dugout/data/route.ts): "ARI" one
// hydration, "AZ" a couple hours later from the exact same endpoint this
// file's own getMLBSchedule() call also hits. Since this lookup is a plain
// `MLB_PARKS[abbr]`, a hydration that returns the form not listed here
// silently drops that game from Weather Lab entirely (falsy park -> the
// whole game returns null) rather than just missing a field. Duplicating
// every known-drifting key under both forms — same defensive approach
// mlbTeamColors.ts already takes — is simpler here than introducing a
// canonicalization function for a lookup this small.
export const MLB_PARKS: Record<string, ParkInfo> = {
  ARI: { name: 'Chase Field', city: 'Phoenix', lat: 33.4453, lon: -112.0667, roof: 'retractable', orientationDeg: 5 },
  AZ: { name: 'Chase Field', city: 'Phoenix', lat: 33.4453, lon: -112.0667, roof: 'retractable', orientationDeg: 5 },
  ATL: { name: 'Truist Park', city: 'Atlanta', lat: 33.8908, lon: -84.4678, roof: 'open', orientationDeg: 65 },
  BAL: { name: 'Oriole Park at Camden Yards', city: 'Baltimore', lat: 39.2839, lon: -76.6217, roof: 'open', orientationDeg: 30 },
  BOS: { name: 'Fenway Park', city: 'Boston', lat: 42.3467, lon: -71.0972, roof: 'open', orientationDeg: 45 },
  CHC: { name: 'Wrigley Field', city: 'Chicago', lat: 41.9484, lon: -87.6553, roof: 'open', orientationDeg: 30 },
  CWS: { name: 'Rate Field', city: 'Chicago', lat: 41.8299, lon: -87.6338, roof: 'open', orientationDeg: 52 },
  CHW: { name: 'Rate Field', city: 'Chicago', lat: 41.8299, lon: -87.6338, roof: 'open', orientationDeg: 52 },
  CIN: { name: 'Great American Ball Park', city: 'Cincinnati', lat: 39.0979, lon: -84.5066, roof: 'open', orientationDeg: 90 },
  CLE: { name: 'Progressive Field', city: 'Cleveland', lat: 41.4962, lon: -81.6852, roof: 'open', orientationDeg: 5 },
  COL: { name: 'Coors Field', city: 'Denver', lat: 39.7559, lon: -104.9942, roof: 'open', orientationDeg: 25 },
  DET: { name: 'Comerica Park', city: 'Detroit', lat: 42.339, lon: -83.0485, roof: 'open', orientationDeg: 150 },
  HOU: { name: 'Daikin Park', city: 'Houston', lat: 29.7573, lon: -95.3555, roof: 'retractable', orientationDeg: 20 },
  KC: { name: 'Kauffman Stadium', city: 'Kansas City', lat: 39.0517, lon: -94.4803, roof: 'open', orientationDeg: 75 },
  KCR: { name: 'Kauffman Stadium', city: 'Kansas City', lat: 39.0517, lon: -94.4803, roof: 'open', orientationDeg: 75 },
  LAA: { name: 'Angel Stadium', city: 'Anaheim', lat: 33.8003, lon: -117.8827, roof: 'open', orientationDeg: 20 },
  LAD: { name: 'Dodger Stadium', city: 'Los Angeles', lat: 34.0739, lon: -118.24, roof: 'open', orientationDeg: 25 },
  MIA: { name: 'loanDepot park', city: 'Miami', lat: 25.7781, lon: -80.2196, roof: 'retractable', orientationDeg: 30 },
  MIL: { name: 'American Family Field', city: 'Milwaukee', lat: 43.028, lon: -87.9712, roof: 'retractable', orientationDeg: 20 },
  MIN: { name: 'Target Field', city: 'Minneapolis', lat: 44.9817, lon: -93.2776, roof: 'open', orientationDeg: 96 },
  NYM: { name: 'Citi Field', city: 'New York', lat: 40.7571, lon: -73.8458, roof: 'open', orientationDeg: 30 },
  NYY: { name: 'Yankee Stadium', city: 'New York', lat: 40.8296, lon: -73.9262, roof: 'open', orientationDeg: 75 },
  ATH: { name: 'Sutter Health Park', city: 'West Sacramento', lat: 38.5805, lon: -121.5133, roof: 'open', orientationDeg: 45 },
  OAK: { name: 'Sutter Health Park', city: 'West Sacramento', lat: 38.5805, lon: -121.5133, roof: 'open', orientationDeg: 45 },
  PHI: { name: 'Citizens Bank Park', city: 'Philadelphia', lat: 39.9061, lon: -75.1665, roof: 'open', orientationDeg: 15 },
  PIT: { name: 'PNC Park', city: 'Pittsburgh', lat: 40.4469, lon: -80.0057, roof: 'open', orientationDeg: 30 },
  SD: { name: 'Petco Park', city: 'San Diego', lat: 32.7073, lon: -117.1566, roof: 'open', orientationDeg: 350 },
  SDP: { name: 'Petco Park', city: 'San Diego', lat: 32.7073, lon: -117.1566, roof: 'open', orientationDeg: 350 },
  SF: { name: 'Oracle Park', city: 'San Francisco', lat: 37.7786, lon: -122.3893, roof: 'open', orientationDeg: 335 },
  SFG: { name: 'Oracle Park', city: 'San Francisco', lat: 37.7786, lon: -122.3893, roof: 'open', orientationDeg: 335 },
  SEA: { name: 'T-Mobile Park', city: 'Seattle', lat: 47.5914, lon: -122.3325, roof: 'retractable', orientationDeg: 45 },
  STL: { name: 'Busch Stadium', city: 'St. Louis', lat: 38.6226, lon: -90.1928, roof: 'open', orientationDeg: 35 },
  TB: { name: 'Tropicana Field', city: 'St. Petersburg', lat: 27.7683, lon: -82.6534, roof: 'dome', orientationDeg: 45 },
  TBR: { name: 'Tropicana Field', city: 'St. Petersburg', lat: 27.7683, lon: -82.6534, roof: 'dome', orientationDeg: 45 },
  TEX: { name: 'Globe Life Field', city: 'Arlington', lat: 32.7473, lon: -97.0842, roof: 'retractable', orientationDeg: 25 },
  TOR: { name: 'Rogers Centre', city: 'Toronto', lat: 43.6414, lon: -79.3894, roof: 'retractable', orientationDeg: 0 },
  WSH: { name: 'Nationals Park', city: 'Washington', lat: 38.873, lon: -77.0074, roof: 'open', orientationDeg: 30 },
  WSN: { name: 'Nationals Park', city: 'Washington', lat: 38.873, lon: -77.0074, roof: 'open', orientationDeg: 30 },
}

// How aligned the wind is with THIS park's actual center-field orientation,
// -1 (dead blowing in) .. +1 (dead blowing out), scaled by speed (an 18mph+
// wind is "full" magnitude, calmer wind fades toward 0 regardless of
// direction). Shared by hrWindColor (direction-only heat) and
// hrWeatherScore (direction + temp + humidity combined) so the two can't
// silently drift apart on the same underlying alignment math.
function windAlignmentScore(windDirDeg: number | null, windMph: number | null, orientationDeg: number): number {
  if (windDirDeg == null) return 0
  const blowsTo = windDirDeg + 180
  const rad = ((blowsTo - orientationDeg) * Math.PI) / 180
  const alignment = Math.cos(rad) // +1 = dead out, -1 = dead in, 0 = crosswind
  const magnitude = Math.min(1, (windMph ?? 0) / 18)
  return alignment * magnitude // -1..1
}

// Red -> yellow -> green interpolation for a score already normalized to
// -1 (fully suppressing) .. +1 (fully boosting). Shared by hrWindColor
// (wind-only) and hrScoreColor (full weather score, pre-normalized before
// calling this).
function heatColor(t01: number): string {
  const red = { r: 239, g: 68, b: 68 }
  const yellow = { r: 234, g: 179, b: 8 }
  const green = { r: 34, g: 197, b: 94 }
  const [a, b] = t01 < 0.5 ? [red, yellow] : [yellow, green]
  const localT = t01 < 0.5 ? t01 / 0.5 : (t01 - 0.5) / 0.5
  const r = Math.round(a.r + (b.r - a.r) * localT)
  const g = Math.round(a.g + (b.g - a.g) * localT)
  const bl = Math.round(a.b + (b.b - a.b) * localT)
  return `rgb(${r}, ${g}, ${bl})`
}

// Red (suppresses HR carry — wind blowing in) -> yellow (neutral/crosswind)
// -> green (blowing out — helps carry), scaled by both direction alignment
// AND wind speed. A 3mph "out" wind barely matters; a 15mph one matters a
// lot — so this isn't just a directional flag, the color itself gets more
// saturated/extreme as speed increases.
export function hrWindColor(windDirDeg: number | null, windMph: number | null, orientationDeg: number): string {
  if (windDirDeg == null) return '#6b7280' // gray — no data
  const score = windAlignmentScore(windDirDeg, windMph, orientationDeg) // -1..1
  return heatColor((score + 1) / 2)
}

export interface HrWeatherInput {
  tempF: number | null
  humidity: number | null
  windDirDeg: number | null
  windMph: number | null
  orientationDeg: number
  sheltered: boolean // dome, or a retractable roof (we don't have live open/closed status)
}

export interface HrWeatherResult {
  score: number // -3 (suppresses HR carry) .. +3 (boosts it)
  label: string
  factors: string[]
  color: string
}

// A live, from-scratch HR-carry read for the currently selected hour —
// computed entirely from what Weather Lab already fetches (Open-Meteo temp/
// humidity/wind + this park's real center-field orientation), not a scraped
// third-party page. That matters: mlb-party's own equivalent (game_weather.
// hr_weather_score, a Supabase edge function that scrapes baseballwx.com)
// turned out to have its wind columns silently null for all but its first
// day of data (the scraper's HTML-table regex broke against the live site
// and nothing ever surfaced that), plus a wind-direction rule that assumed
// the same "SW/W/NW blows out" bucket for every park regardless of actual
// orientation. Building this here instead means it rides the same live,
// per-hour, per-date fetch the rest of the page already depends on — no
// separate ingest job that can go stale or silently break.
//
// This is still a physics-*informed* approximation, not a rigorous carry
// simulation (no altitude/air-pressure input, no ball-flight integration) —
// coefficients are hand-tuned to roughly match published research (warmer/
// less-dense air adds a few feet of carry per 10°F; wind is the dominant
// factor, humid air is very slightly LESS dense than dry air despite the
// common intuition, since H2O's molar mass is lower than N2/O2's). Good
// enough for an at-a-glance "does today's weather help or hurt the over,"
// not a substitute for a real park-factor model.
export function hrWeatherScore(input: HrWeatherInput): HrWeatherResult {
  if (input.sheltered) {
    return { score: 0, label: 'Neutral — indoors', factors: [], color: heatColor(0.5) }
  }

  let score = 0
  const factors: string[] = []

  if (input.tempF != null) {
    const t = (input.tempF - 70) * 0.04
    score += t
    if (input.tempF >= 85) factors.push('Hot air (+carry)')
    else if (input.tempF >= 75) factors.push('Warm (+slight carry)')
    else if (input.tempF <= 55) factors.push('Cold air (−carry)')
  }

  if (input.humidity != null) {
    // Counterintuitive but real: humid air is LESS dense than dry air
    // (water vapor's molar mass is lower than N2/O2's), so more humidity
    // means very slightly more carry, not less. Kept small on purpose —
    // this is a minor effect next to wind and temperature.
    score += (input.humidity - 50) * 0.006
    if (input.humidity >= 80) factors.push('Humid (+slight carry)')
    else if (input.humidity <= 25) factors.push('Dry air (−slight carry)')
  }

  if (input.windDirDeg != null) {
    const align = windAlignmentScore(input.windDirDeg, input.windMph, input.orientationDeg) // -1..1
    const windScore = align * 2.2
    score += windScore
    const mph = input.windMph ?? 0
    if (align > 0.35) factors.push(mph >= 12 ? 'Wind blowing OUT (+carry)' : 'Light wind out')
    else if (align < -0.35) factors.push(mph >= 12 ? 'Wind blowing IN (−carry)' : 'Light wind in')
    else if (mph >= 10) factors.push('Crosswind')
  }

  score = Math.max(-3, Math.min(3, Math.round(score * 10) / 10))
  const label = factors.length
    ? factors.join(' · ')
    : score >= 0.5 ? 'Favorable conditions' : score <= -0.5 ? 'Unfavorable conditions' : 'Neutral conditions'

  return { score, label, factors, color: heatColor((score / 3 + 1) / 2) }
}

// Open-Meteo WMO weather codes -> short label.
export const WMO_LABELS: Record<number, string> = {
  0: 'Sunny', 1: 'Mostly Sunny', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog', 51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
  56: 'Freezing Drizzle', 57: 'Freezing Drizzle', 61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
  66: 'Freezing Rain', 67: 'Freezing Rain', 71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow',
  77: 'Snow Grains', 80: 'Rain Showers', 81: 'Rain Showers', 82: 'Heavy Showers',
  85: 'Snow Showers', 86: 'Snow Showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Severe Storm',
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

// Meteorological wind direction is "blowing FROM" — books/weather sites show
// "SSW to NNE" meaning wind is coming from SSW and heading toward NNE.
export function compassFromTo(degFrom: number): { from: string; to: string } {
  const idx = Math.round(degFrom / 22.5) % 16
  const from = COMPASS[idx]
  const to = COMPASS[(idx + 8) % 16]
  return { from, to }
}
