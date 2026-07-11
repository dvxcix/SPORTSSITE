// Shared between the daily final-settlement cron (settle-picks) and the
// live in-progress-game cron (grade-live-picks) — both need the exact same
// stat-threshold logic so a leg can never grade differently depending on
// which pass touched it first.

// Batting-stat threshold per pick_type (matches PROP_META's pickType values
// in hub/src/lib/watchlist.ts). "first_hr" is handled separately since it
// needs play-by-play order, not just the box score line.
export const THRESHOLDS: Record<string, (b: any) => boolean> = {
  anytime_hr:    (b) => (b.homeRuns ?? 0) >= 1,
  hr_2plus:      (b) => (b.homeRuns ?? 0) >= 2,
  hits:          (b) => (b.hits ?? 0) >= 1,
  single:        (b) => ((b.hits ?? 0) - (b.doubles ?? 0) - (b.triples ?? 0) - (b.homeRuns ?? 0)) >= 1,
  double:        (b) => (b.doubles ?? 0) >= 1,
  triple:        (b) => (b.triples ?? 0) >= 1,
  rbi:           (b) => (b.rbi ?? 0) >= 1,
  rbi_2plus:     (b) => (b.rbi ?? 0) >= 2,
  rbi_3plus:     (b) => (b.rbi ?? 0) >= 3,
  total_bases:   (b) => (b.totalBases ?? 0) >= 2,
  total_bases_4plus: (b) => (b.totalBases ?? 0) >= 4,
  total_bases_5plus: (b) => (b.totalBases ?? 0) >= 5,
  run_scored:    (b) => (b.runs ?? 0) >= 1,
  stolen_base:   (b) => (b.stolenBases ?? 0) >= 1,
  batter_strikeout: (b) => (b.strikeOuts ?? 0) >= 1,
  hits_runs_rbis: (b) => ((b.hits ?? 0) + (b.runs ?? 0) + (b.rbi ?? 0)) >= 1,
}

export async function fetchLiveFeed(gamePk: string) {
  const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json()
}

// The first HR of the game, by earliest at-bat index across both teams.
// Works fine against an in-progress feed too — it just reflects however
// many home runs have happened so far.
export function findFirstHrBatterId(liveFeed: any): number | null {
  const plays: any[] = liveFeed?.liveData?.plays?.allPlays ?? []
  const hrPlays = plays
    .filter(p => p.result?.eventType === 'home_run')
    .sort((a, b) => (a.atBatIndex ?? 0) - (b.atBatIndex ?? 0))
  return hrPlays[0]?.matchup?.batter?.id ?? null
}

export function findBattingLine(liveFeed: any, mlbId: number): any | null {
  const teams = liveFeed?.liveData?.boxscore?.teams
  if (!teams) return null
  for (const side of ['home', 'away']) {
    const p = teams[side]?.players?.[`ID${mlbId}`]
    if (p) return p.stats?.batting ?? null
  }
  return null // player not in either team's box score = did not play
}

export type PendingPick = { id: string; post_id: string | null; mlb_id: number; pick_type: string }

export type SettleOutcome = {
  result: 'win' | 'loss' | 'push'
  postId: string | null
  legPlayerName: string | null
  legHeadshotUrl: string | null
  // Set only when this leg completed the LAST pending leg on its post,
  // i.e. the overall pick/parlay just became final — useful for firing a
  // one-time "your pick settled" notification instead of one per leg.
  overallResult: 'win' | 'loss' | 'push' | null
}

// Full final-game settlement for one pick: determines win/loss/push against
// the Final box score (a DNP push, first_hr play-by-play order, or a batting-
// stat threshold) and writes it to both `picks` and the post's `pick_data`
// (single pick, or the matching leg + parlay rollup). Shared by settle-picks
// (daily, the backstop) and grade-live-picks (every ~2min, the primary path
// now that it also settles Final games instead of only early live wins) so
// a game can never grade differently depending on which cron reached it
// first. Returns null when the pick_type isn't supported — left pending
// rather than guessed, same as before.
export async function settleFinalPick(admin: any, pick: PendingPick, feed: any, propMeta: Record<string, { pickType: string }>): Promise<SettleOutcome | null> {
  const battingLine = findBattingLine(feed, pick.mlb_id)
  let result: 'win' | 'loss' | 'push'

  if (!battingLine) {
    result = 'push' // scratched/DNP — standard sportsbook convention is void
  } else if (pick.pick_type === 'first_hr') {
    const firstHrBatterId = findFirstHrBatterId(feed)
    result = firstHrBatterId === pick.mlb_id ? 'win' : 'loss'
  } else {
    const check = THRESHOLDS[pick.pick_type]
    if (!check) return null
    result = check(battingLine) ? 'win' : 'loss'
  }

  const nowIso = new Date().toISOString()
  await admin.from('picks').update({ result, graded_at: nowIso }).eq('id', pick.id)

  let legPlayerName: string | null = null
  let legHeadshotUrl: string | null = null
  let overallResult: 'win' | 'loss' | 'push' | null = null

  if (pick.post_id) {
    const applied = await applyLegResultToPost(admin, pick.post_id, pick.mlb_id, pick.pick_type, result, propMeta)
    legPlayerName = applied.legPlayerName
    legHeadshotUrl = applied.legHeadshotUrl
    overallResult = applied.overallResult
  }

  return { result, postId: pick.post_id, legPlayerName, legHeadshotUrl, overallResult }
}

// posts.pick_data is one JSON blob shared across every leg — a plain
// read-modify-write races when two legs of the SAME post grade close
// together (e.g. one leg's game goes Live→early-win while another leg's
// separate game goes Final in the same or an overlapping cron run): both
// read the old blob, both write their own version back, and whichever
// write lands second silently erases the first leg's result. Confirmed
// this actually happened in production (a leg's `picks` row said 'loss'
// while its post's pick_data still showed 'pending' for that same leg).
// Postgres compares jsonb by value, so .eq('pick_data', before) works as a
// compare-and-swap: the write only lands if nothing else changed the row
// since we read it, and we retry against the fresh copy if it did.
export async function applyLegResultToPost(
  admin: any, postId: string, mlbId: number, pickType: string, result: 'win' | 'loss' | 'push',
  propMeta: Record<string, { pickType: string }>,
): Promise<{ legPlayerName: string | null; legHeadshotUrl: string | null; overallResult: 'win' | 'loss' | 'push' | null }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: post } = await admin.from('posts').select('pick_data').eq('id', postId).single()
    if (!post?.pick_data) return { legPlayerName: null, legHeadshotUrl: null, overallResult: null }
    const before = post.pick_data

    let legPlayerName: string | null = null
    let legHeadshotUrl: string | null = null
    let overallResult: 'win' | 'loss' | 'push' | null = null
    let updated: any

    if (Array.isArray(before.legs)) {
      const legs = before.legs.map((leg: any) => {
        const legPickType = propMeta[leg.prop_key]?.pickType ?? leg.prop_key
        if (leg.mlb_id === mlbId && legPickType === pickType && leg.result === 'pending') {
          legPlayerName = leg.player_name
          legHeadshotUrl = leg.headshot_url ?? null
          return { ...leg, result }
        }
        return leg
      })
      const wasAlreadyFinal = before.result && before.result !== 'pending'
      const allGraded = legs.every((l: any) => l.result !== 'pending')
      const overall = !allGraded ? before.result
        : legs.some((l: any) => l.result === 'loss') ? 'loss'
        : legs.every((l: any) => l.result === 'push') ? 'push'
        : 'win'
      if (allGraded && !wasAlreadyFinal) overallResult = overall
      updated = { ...before, legs, result: overall }
    } else {
      legPlayerName = before.player_name ?? null
      legHeadshotUrl = before.headshot_url ?? null
      overallResult = result
      updated = { ...before, result }
    }

    const { data: written, error } = await admin.from('posts')
      .update({ pick_data: updated })
      .eq('id', postId)
      .eq('pick_data', before)
      .select('id')
    if (!error && written?.length) return { legPlayerName, legHeadshotUrl, overallResult }
    // Someone else updated pick_data between our read and write (another
    // leg graded concurrently) — loop and retry against the fresh copy.
  }
  return { legPlayerName: null, legHeadshotUrl: null, overallResult: null }
}

// Checks whether a pick has ALREADY clinched a win against the current feed
// state — safe to call against a still-in-progress game, since a stat that
// has already happened can't be undone. Returns null when the threshold
// hasn't been reached yet (still could go either way) or the pick_type
// isn't supported — callers should leave the pick pending in that case,
// NOT treat null as a loss (that determination requires the game to be
// Final, which is what settle-picks alone still handles).
export function checkEarlyWin(pickType: string, mlbId: number, liveFeed: any): boolean | null {
  const battingLine = findBattingLine(liveFeed, mlbId)
  if (!battingLine) return null // hasn't appeared in the box score yet

  if (pickType === 'first_hr') {
    const firstHrBatterId = findFirstHrBatterId(liveFeed)
    return firstHrBatterId === mlbId ? true : null
  }
  const check = THRESHOLDS[pickType]
  if (!check) return null
  return check(battingLine) ? true : null
}
