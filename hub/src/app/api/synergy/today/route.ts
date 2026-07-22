import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { currentSeason } from '@/lib/playerSync'
import { getTodaysMatchups, type LineupPlayer, type ProbablePitcher } from '@/lib/mlbSchedule'
import { fetchPlayerHomeRuns, fetchPlayerGameDates, enrichPitchRows } from '@/lib/pitchLogFetch'
import { type PitchLogRow } from '@/lib/batterStatsEngine'
import { scoreFrom } from '@/lib/affinityScore'

export const revalidate = 0

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, worker))
  return results
}

type Matchup = {
  gameKey: string
  lineupConfirmed: boolean
  batter: LineupPlayer
  pitcher: ProbablePitcher
  pitcherTeamAbbr: string
}

// The real "every batter vs. their game's actual opposing starter" list for
// Synergy — same pairing rule Dugout's own PlayerDrillDown already uses
// (home lineup faces the away starter and vice versa), never a batter
// against a pitcher he isn't really facing tonight.
function buildMatchups(games: Awaited<ReturnType<typeof getTodaysMatchups>>): Matchup[] {
  const matchups: Matchup[] = []
  for (const g of games) {
    if (g.awayPitcher) {
      for (const b of g.homeLineup) matchups.push({ gameKey: g.gameKey, lineupConfirmed: g.homeLineupConfirmed, batter: b, pitcher: g.awayPitcher, pitcherTeamAbbr: g.awayAbbr })
    }
    if (g.homePitcher) {
      for (const b of g.awayLineup) matchups.push({ gameKey: g.gameKey, lineupConfirmed: g.awayLineupConfirmed, batter: b, pitcher: g.homePitcher, pitcherTeamAbbr: g.homeAbbr })
    }
  }
  return matchups
}

// Real Statcast HR-affinity evidence + recent-form scoring for every real
// batter-vs-starter matchup on today's slate, computed once here instead of
// letting ~150 individually-mounted AffinityMatchupScore cards each redo
// the same fetch/compute (see that component for the single-matchup version
// of this exact logic — kept in lockstep via the shared scoreFrom() in
// affinityScore.ts). Deliberately only ever fetches (a) each player's real
// home runs (fetchPlayerHomeRuns, hits player_pitch_log's own partial
// `WHERE is_home_run` index) and (b) his skinny games-played calendar
// (fetchPlayerGameDates) — never the full per-pitch log across ~150
// players, which is exactly what this feature ever needs (evidence is
// HR-only by definition) but which blew a real Postgres statement timeout
// when tried at this concurrency. Ultimate-gated: this is a standalone
// synthesis product surface, not a shared partial-data route like
// /api/dugout/data.
export async function GET() {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

  const games = await getTodaysMatchups()
  const matchups = buildMatchups(games)
  if (!matchups.length) return NextResponse.json({ matchups: [] })

  const admin = createAdminClient()
  const season = currentSeason()

  const uniqueBatterIds = Array.from(new Set(matchups.map(m => m.batter.mlb_id)))
  const uniquePitcherIds = Array.from(new Set(matchups.map(m => m.pitcher.id)))

  const [batterHrByIdx, pitcherHrByIdx, batterDatesByIdx, pitcherDatesByIdx] = await Promise.all([
    mapWithConcurrency(uniqueBatterIds, 15, id => fetchPlayerHomeRuns(admin, id, 'batter')),
    mapWithConcurrency(uniquePitcherIds, 15, id => fetchPlayerHomeRuns(admin, id, 'pitcher')),
    mapWithConcurrency(uniqueBatterIds, 15, id => fetchPlayerGameDates(admin, id, 'batter')),
    mapWithConcurrency(uniquePitcherIds, 15, id => fetchPlayerGameDates(admin, id, 'pitcher')),
  ])

  const opponentIds = new Set<number>()
  const gamePks = new Set<string>()
  for (const rows of batterHrByIdx) for (const r of rows) { opponentIds.add(r.pitcher_id); gamePks.add(r.game_pk) }
  for (const rows of pitcherHrByIdx) for (const r of rows) { opponentIds.add(r.batter_id); gamePks.add(r.game_pk) }

  const [oppRes, gamesRes] = await Promise.all([
    opponentIds.size ? admin.from('players').select('mlb_id, full_name, current_team_abbr').in('mlb_id', Array.from(opponentIds)) : Promise.resolve({ data: [] as { mlb_id: number; full_name: string | null; current_team_abbr: string | null }[] }),
    gamePks.size ? admin.from('games').select('game_pk, day_night, venue_name').in('game_pk', Array.from(gamePks)) : Promise.resolve({ data: [] as { game_pk: string; day_night: string | null; venue_name: string | null }[] }),
  ])
  const opponents = Object.fromEntries((oppRes.data ?? []).map(p => [p.mlb_id, p]))
  const gameInfo = Object.fromEntries((gamesRes.data ?? []).map(g => [g.game_pk, g]))

  const batterHrById = new Map<number, PitchLogRow[]>()
  uniqueBatterIds.forEach((id, i) => batterHrById.set(id, enrichPitchRows(batterHrByIdx[i], 'pitcher_id', opponents, gameInfo) as PitchLogRow[]))
  const pitcherHrById = new Map<number, PitchLogRow[]>()
  uniquePitcherIds.forEach((id, i) => pitcherHrById.set(id, enrichPitchRows(pitcherHrByIdx[i], 'batter_id', opponents, gameInfo) as PitchLogRow[]))
  const batterDatesById = new Map<number, string[]>()
  uniqueBatterIds.forEach((id, i) => batterDatesById.set(id, batterDatesByIdx[i]))
  const pitcherDatesById = new Map<number, string[]>()
  uniquePitcherIds.forEach((id, i) => pitcherDatesById.set(id, pitcherDatesByIdx[i]))

  // Which side a switch hitter is really batting from in TODAY's exact
  // matchup — the standard platoon convention (opposite the actual opposing
  // starter's throwing hand). Unlike the single-matchup AffinityMatchupScore
  // (which has no per-matchup pitcher-hand context handy and instead infers
  // his season-long dominant side from pitch log rows), Synergy already
  // knows today's real opposing hand for free, so it can use the more
  // contextually-correct answer without an extra fetch.
  const standFor = (batter: LineupPlayer, pitcher: ProbablePitcher) =>
    batter.bats === 'S' ? (pitcher.hand === 'L' ? 'R' : 'L') : (batter.bats === 'L' ? 'L' : 'R')

  const pitcherKeys = Array.from(new Set(matchups.map(m => `${m.pitcher.id}-${m.pitcher.hand}`)))
  const hitterKeys = Array.from(new Set(matchups.map(m => `${m.batter.mlb_id}-${standFor(m.batter, m.pitcher)}`)))

  const [pitcherMatchesRes, hitterMatchesRes] = await Promise.all([
    pitcherKeys.length
      ? admin.from('pitcher_affinity_matches').select('key1, key2, match_score').in('key1', pitcherKeys).eq('season', season).gte('match_score', 0.75)
      : Promise.resolve({ data: [] as { key1: string; key2: string; match_score: number }[] }),
    hitterKeys.length
      ? admin.from('hitter_affinity_matches').select('key1, key2, match_score').in('key1', hitterKeys).eq('season', season).gte('match_score', 0.75)
      : Promise.resolve({ data: [] as { key1: string; key2: string; match_score: number }[] }),
  ])

  const pitcherMatchKeys = Array.from(new Set((pitcherMatchesRes.data ?? []).map(m => m.key2)))
  const hitterMatchKeys = Array.from(new Set((hitterMatchesRes.data ?? []).map(m => m.key2)))
  const [pitcherNamesRes, hitterNamesRes] = await Promise.all([
    pitcherMatchKeys.length
      ? admin.from('pitcher_affinity_profiles').select('key, mlb_id').in('key', pitcherMatchKeys).eq('season', season)
      : Promise.resolve({ data: [] as { key: string; mlb_id: number }[] }),
    hitterMatchKeys.length
      ? admin.from('hitter_affinity_profiles').select('key, mlb_id').in('key', hitterMatchKeys).eq('season', season)
      : Promise.resolve({ data: [] as { key: string; mlb_id: number }[] }),
  ])
  const pitcherMlbIdByKey = Object.fromEntries((pitcherNamesRes.data ?? []).map(r => [r.key, r.mlb_id]))
  const hitterMlbIdByKey = Object.fromEntries((hitterNamesRes.data ?? []).map(r => [r.key, r.mlb_id]))

  const similarPitchersByKey = new Map<string, Map<number, number>>() // key1 -> mlbId -> matchScore
  for (const m of pitcherMatchesRes.data ?? []) {
    const mlbId = pitcherMlbIdByKey[m.key2]; if (mlbId == null) continue
    if (!similarPitchersByKey.has(m.key1)) similarPitchersByKey.set(m.key1, new Map())
    similarPitchersByKey.get(m.key1)!.set(mlbId, Number(m.match_score))
  }
  const similarHittersByKey = new Map<string, Map<number, number>>()
  for (const m of hitterMatchesRes.data ?? []) {
    const mlbId = hitterMlbIdByKey[m.key2]; if (mlbId == null) continue
    if (!similarHittersByKey.has(m.key1)) similarHittersByKey.set(m.key1, new Map())
    similarHittersByKey.get(m.key1)!.set(mlbId, Number(m.match_score))
  }

  const result = matchups.map(({ gameKey, lineupConfirmed, batter, pitcher, pitcherTeamAbbr }) => {
    const batterHrRows = batterHrById.get(batter.mlb_id) ?? []
    const pitcherHrRows = pitcherHrById.get(pitcher.id) ?? []
    const pitcherKey = `${pitcher.id}-${pitcher.hand}`
    const hitterKey = `${batter.mlb_id}-${standFor(batter, pitcher)}`
    const similarPitcherIds = similarPitchersByKey.get(pitcherKey) ?? new Map<number, number>()
    const similarHitterIds = similarHittersByKey.get(hitterKey) ?? new Map<number, number>()

    const evidenceHitters = pitcherHrRows
      .filter(r => similarHitterIds.has(r.batter_id))
      .map(r => ({ ...r, matchScore: similarHitterIds.get(r.batter_id)! }))
      .sort((a, b) => b.game_date.localeCompare(a.game_date))
    const evidencePitchers = batterHrRows
      .filter(r => similarPitcherIds.has(r.pitcher_id))
      .map(r => ({ ...r, matchScore: similarPitcherIds.get(r.pitcher_id)! }))
      .sort((a, b) => b.game_date.localeCompare(a.game_date))

    const batterLast10 = new Set((batterDatesById.get(batter.mlb_id) ?? []).slice(-10))
    const batterFormHr = batterHrRows.filter(r => batterLast10.has(r.game_date)).length
    const batterScore = scoreFrom(batterFormHr, evidencePitchers)

    const pitcherLast3 = new Set((pitcherDatesById.get(pitcher.id) ?? []).slice(-3))
    const pitcherFormHr = pitcherHrRows.filter(r => pitcherLast3.has(r.game_date)).length
    const pitcherScore = scoreFrom(pitcherFormHr, evidenceHitters)

    return {
      gameKey, lineupConfirmed,
      batterId: batter.mlb_id, batterName: batter.name, batterTeamAbbr: batter.team, batterBats: batter.bats,
      pitcherId: pitcher.id, pitcherName: pitcher.name, pitcherTeamAbbr, pitcherHand: pitcher.hand,
      batterScore, pitcherScore, evidencePitchers, evidenceHitters,
    }
  })

  return NextResponse.json({ matchups: result })
}
