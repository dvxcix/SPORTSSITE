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
