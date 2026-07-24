// Shared pitch-log stat-line computation — extracted out of
// BatterMatchupExplorer so every other consumer (PitchZoneHeatmap's pitcher
// stat line, Slate Breakdown's pitcher panel + batter table) reuses the
// exact same engine (real counting stats off the Savant event log, not a
// pre-aggregated table) instead of re-deriving it. The computation is
// identical regardless of whose rows they are — "PA/AVG/OBP/SLG/Whiff%/
// Hard-Hit%/etc from a set of pitch-log rows" works the same whether the
// rows are "pitches this batter saw" or "pitches this pitcher threw," since
// /api/players/[id]/pitch-log already returns the same field set for both
// roles (see enrich() there).
export type PitchLogRow = {
  game_pk: string; game_date: string; pitcher_id: number; batter_id: number
  pitch_type: string | null; zone: number | null; inning: number | null
  balls: number | null; strikes: number | null
  events: string | null; description: string | null
  is_in_play: boolean; is_swing: boolean; is_whiff: boolean; is_home_run: boolean
  launch_speed: number | null; launch_angle: number | null; xwoba: number | null; hit_distance: number | null
  bat_speed: number | null; run_value: number | null; velocity: number | null; spin_rate: number | null
  stand: string | null; p_throws: string | null
  opponent_id: number; opponent_name: string; opponent_team: string | null; day_night: string | null
  bb_type?: string | null
  // Swing-path biomechanics + Savant's own contact-quality bucket — same raw
  // Statcast payload as launch_speed/bat_speed above, surfaced by
  // enrichPitchRows() alongside swing_length/attack_angle (declared above
  // this comment's addition date but already being set at runtime; adding
  // them to the type here rather than leaving them implicit).
  swing_length?: number | null; attack_angle?: number | null
  swing_path_tilt?: number | null; attack_direction?: number | null
  // Savant's own official 1-6 contact-quality bucket, 6 = Barrel — using
  // this directly for Barrel% means not reimplementing Savant's EV/LA
  // barrel formula ourselves.
  launch_speed_angle?: number | null
}
// Role-flavored aliases — same shape, just a clearer name at each call site.
export type BatterPitchRow = PitchLogRow
export type PitcherPitchRow = PitchLogRow

export const r3 = (v: number | null) => (v == null ? '—' : v.toFixed(3))
export const d1 = (v: number | null) => (v == null ? '—' : v.toFixed(1))
export const p1 = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`)
export const i0 = (v: number | null) => (v == null ? '—' : String(Math.round(v)))
const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null)

// Real counting stats straight off the event log — Savant's own `events`
// column is populated only on the pitch that ends a plate appearance, so
// counting occurrences here IS the real total for whatever subset is
// currently filtered, no separate boxscore/game-log needed. From a
// pitcher's own rows this reads as "PA/AVG/OBP/SLG allowed."
export function computeStatLine(rows: PitchLogRow[]) {
  const pitches = rows.length
  const games = new Set(rows.map(r => r.game_date)).size
  const swings = rows.filter(r => r.is_swing)
  const whiffs = rows.filter(r => r.is_whiff)
  const inPlay = rows.filter(r => r.is_in_play)
  const withEv = inPlay.filter((r): r is PitchLogRow & { launch_speed: number } => r.launch_speed != null)
  const withLa = inPlay.filter((r): r is PitchLogRow & { launch_angle: number } => r.launch_angle != null)
  const hardHit = withEv.filter(r => r.launch_speed >= 95)
  // Savant's own bucket 6 = Barrel, straight off the raw payload — not a
  // reimplementation of their EV/LA formula, just reading the classification
  // they already computed on every in-play event.
  const barrels = inPlay.filter(r => r.launch_speed_angle === 6)
  const withXwoba = inPlay.filter((r): r is PitchLogRow & { xwoba: number } => r.xwoba != null)
  const outOfZone = rows.filter(r => r.zone != null && (r.zone as number) >= 11)
  const withBatSpeed = swings.filter((r): r is PitchLogRow & { bat_speed: number } => r.bat_speed != null)
  const withRv = rows.filter((r): r is PitchLogRow & { run_value: number } => r.run_value != null)
  // Swing-path biomechanics are per-SWING, not per-in-play-contact — a
  // whiffed or fouled-off swing still has a real attack angle/swing length,
  // same reasoning as avgBatSpeed above using `swings` rather than `inPlay`.
  const withAttackAngle = swings.filter((r): r is PitchLogRow & { attack_angle: number } => r.attack_angle != null)
  const withSwingLength = swings.filter((r): r is PitchLogRow & { swing_length: number } => r.swing_length != null)
  const withTilt = swings.filter((r): r is PitchLogRow & { swing_path_tilt: number } => r.swing_path_tilt != null)
  const withAttackDir = swings.filter((r): r is PitchLogRow & { attack_direction: number } => r.attack_direction != null)

  const events = rows.map(r => r.events).filter((e): e is string => !!e)
  const cnt = (name: string) => events.filter(e => e === name).length
  const bb = cnt('walk') + cnt('intent_walk')
  const hbp = cnt('hit_by_pitch')
  const k = cnt('strikeout') + cnt('strikeout_double_play')
  const singles = cnt('single'), doubles = cnt('double'), triples = cnt('triple'), hr = cnt('home_run')
  const hits = singles + doubles + triples + hr
  const sacFly = cnt('sac_fly') + cnt('sac_fly_double_play')
  const sacBunt = cnt('sac_bunt') + cnt('sac_bunt_double_play')
  const pa = events.length
  const ab = pa - bb - hbp - sacFly - sacBunt
  const obpDenom = ab + bb + hbp + sacFly
  const totalBases = singles + 2 * doubles + 3 * triples + 4 * hr

  return {
    pitches, games, pa, ab, hits, singles, doubles, triples, bb, k, hr,
    avg: ab > 0 ? hits / ab : null,
    obp: obpDenom > 0 ? (hits + bb + hbp) / obpDenom : null,
    slg: ab > 0 ? totalBases / ab : null,
    usage: null as number | null, // filled in relative to a parent "All" row by the caller, where that concept applies
    bbPerGame: games > 0 ? bb / games : null,
    kPct: pa > 0 ? (k / pa) * 100 : null,
    swingPct: pitches > 0 ? (swings.length / pitches) * 100 : null,
    whiffPct: swings.length > 0 ? (whiffs.length / swings.length) * 100 : null,
    chasePct: outOfZone.length > 0 ? (outOfZone.filter(r => r.is_swing).length / outOfZone.length) * 100 : null,
    bbe: inPlay.length,
    avgEv: withEv.length ? avg(withEv.map(r => r.launch_speed)) : null,
    maxEv: withEv.length ? Math.max(...withEv.map(r => r.launch_speed)) : null,
    avgLa: withLa.length ? avg(withLa.map(r => r.launch_angle)) : null,
    hardHitPct: withEv.length ? (hardHit.length / withEv.length) * 100 : null,
    barrelPct: inPlay.length ? (barrels.length / inPlay.length) * 100 : null,
    xwobaContact: withXwoba.length ? avg(withXwoba.map(r => r.xwoba)) : null,
    avgBatSpeed: withBatSpeed.length ? avg(withBatSpeed.map(r => r.bat_speed)) : null,
    avgAttackAngle: withAttackAngle.length ? avg(withAttackAngle.map(r => r.attack_angle)) : null,
    avgSwingLength: withSwingLength.length ? avg(withSwingLength.map(r => r.swing_length)) : null,
    avgTilt: withTilt.length ? avg(withTilt.map(r => r.swing_path_tilt)) : null,
    avgAttackDirection: withAttackDir.length ? avg(withAttackDir.map(r => r.attack_direction)) : null,
    runValuePer100: withRv.length ? avg(withRv.map(r => r.run_value))! * 100 : null,
  }
}
// Old name, kept as an alias so existing call sites don't need touching.
export const computeBatterStats = computeStatLine
export type BatterStats = ReturnType<typeof computeStatLine>

// noHeat: raw counts (Pitches/Usage%/PA, and H/1B/2B/3B/HR/BB/K right below
// them) scale with how many pitches of that type were even thrown, not with
// how well the batter/pitcher actually performed — a pitch type seen 3x more
// often naturally racks up more hits/walks/strikeouts regardless of quality,
// so heat-coloring them (confirmed live: looked "horrible", swinging to
// fully-saturated colors off tiny, volume-driven samples) is a false signal.
// Every other column here is a real, sample-size-normalized performance rate
// (green = good for whoever's page/row this is — flip `dir` when reading a
// pitcher's own allowed-contact numbers instead of a batter's), which is the
// only kind of column this heat-map is meant to represent.
export const BATTER_STAT_COLS: { key: keyof BatterStats; label: string; dir: 'hi' | 'lo'; fmt: (v: any) => string; noHeat?: boolean }[] = [
  { key: 'pitches', label: 'Pitches', dir: 'hi', fmt: i0, noHeat: true },
  { key: 'usage', label: 'Usage %', dir: 'hi', fmt: p1, noHeat: true },
  { key: 'pa', label: 'PA', dir: 'hi', fmt: i0, noHeat: true },
  { key: 'hits', label: 'H', dir: 'hi', fmt: i0, noHeat: true },
  { key: 'singles', label: '1B', dir: 'hi', fmt: i0, noHeat: true },
  { key: 'doubles', label: '2B', dir: 'hi', fmt: i0, noHeat: true },
  { key: 'triples', label: '3B', dir: 'hi', fmt: i0, noHeat: true },
  { key: 'hr', label: 'HR', dir: 'hi', fmt: i0, noHeat: true },
  { key: 'bb', label: 'BB', dir: 'hi', fmt: i0, noHeat: true },
  { key: 'k', label: 'K', dir: 'lo', fmt: i0, noHeat: true },
  { key: 'avg', label: 'AVG', dir: 'hi', fmt: r3 },
  { key: 'obp', label: 'OBP', dir: 'hi', fmt: r3 },
  { key: 'slg', label: 'SLG', dir: 'hi', fmt: r3 },
  { key: 'whiffPct', label: 'Whiff %', dir: 'lo', fmt: p1 },
  { key: 'chasePct', label: 'Chase %', dir: 'lo', fmt: p1 },
  { key: 'avgEv', label: 'Avg EV', dir: 'hi', fmt: d1 },
  { key: 'hardHitPct', label: 'Hard-Hit %', dir: 'hi', fmt: p1 },
  { key: 'xwobaContact', label: 'xwOBA (Ct)', dir: 'hi', fmt: r3 },
  { key: 'avgBatSpeed', label: 'Bat Speed', dir: 'hi', fmt: d1 },
]

// Pitcher-perspective column set — same underlying stat line, direction
// flipped (low AVG/SLG/hard-hit/xwOBA allowed is green for a pitcher, high
// whiff/chase induced is green), plus run value/100 which only makes sense
// read from the pitcher's side.
export const PITCHER_STAT_COLS: { key: keyof BatterStats; label: string; dir: 'hi' | 'lo'; fmt: (v: any) => string; noHeat?: boolean }[] = [
  { key: 'pitches', label: 'Pitches', dir: 'lo', fmt: i0, noHeat: true },
  { key: 'usage', label: 'Usage %', dir: 'lo', fmt: p1, noHeat: true },
  { key: 'pa', label: 'PA', dir: 'lo', fmt: i0, noHeat: true },
  { key: 'hits', label: 'H', dir: 'lo', fmt: i0, noHeat: true },
  { key: 'singles', label: '1B', dir: 'lo', fmt: i0, noHeat: true },
  { key: 'doubles', label: '2B', dir: 'lo', fmt: i0, noHeat: true },
  { key: 'triples', label: '3B', dir: 'lo', fmt: i0, noHeat: true },
  { key: 'hr', label: 'HR', dir: 'lo', fmt: i0, noHeat: true },
  { key: 'bb', label: 'BB', dir: 'lo', fmt: i0, noHeat: true },
  { key: 'k', label: 'K', dir: 'hi', fmt: i0, noHeat: true },
  { key: 'avg', label: 'AVG', dir: 'lo', fmt: r3 },
  { key: 'obp', label: 'OBP', dir: 'lo', fmt: r3 },
  { key: 'slg', label: 'SLG', dir: 'lo', fmt: r3 },
  { key: 'whiffPct', label: 'Whiff %', dir: 'hi', fmt: p1 },
  { key: 'chasePct', label: 'Chase %', dir: 'hi', fmt: p1 },
  { key: 'avgEv', label: 'Avg EV', dir: 'lo', fmt: d1 },
  { key: 'hardHitPct', label: 'Hard-Hit %', dir: 'lo', fmt: p1 },
  { key: 'xwobaContact', label: 'xwOBA (Ct)', dir: 'lo', fmt: r3 },
  { key: 'runValuePer100', label: 'RV/100', dir: 'lo', fmt: d1 },
]

// Last-N-distinct-games-played slice — the same "recency" concept used
// throughout the player page (BatterMatchupExplorer, PitchZoneHeatmap),
// just factored out so Slate Breakdown's pitcher AND batter recency
// selectors both resolve against a player's real games-played calendar
// instead of a fixed calendar-day window.
export function lastNGameDates(rows: { game_date: string }[], n: number): Set<string> {
  const dates = Array.from(new Set(rows.map(r => r.game_date))).sort()
  return new Set(dates.slice(-n))
}

// A pitcher's pitch mix for whatever rows are passed in (already filtered to
// the recency window the caller wants) — every distinct pitch type he threw,
// with usage% of his own pitch count. This is the filter Slate Breakdown's
// batter table applies to each opposing batter's own pitch log: "how has
// this batter done against the pitch types this starter actually throws."
export function pitchMix(rows: PitchLogRow[]): { pitchType: string; count: number; usage: number }[] {
  const total = rows.length
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (!r.pitch_type) continue
    counts.set(r.pitch_type, (counts.get(r.pitch_type) ?? 0) + 1)
  }
  return Array.from(counts, ([pitchType, count]) => ({ pitchType, count, usage: total > 0 ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count)
}
