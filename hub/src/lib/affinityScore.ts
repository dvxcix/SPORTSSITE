// The 0-10 "Affinity Matchup" score — shared between AffinityMatchupScore.tsx
// (one matchup, computed client-side off already-loaded Dugout data) and the
// bulk Synergy route (every real matchup on today's slate, computed server-
// side) so both surfaces score a given matchup identically.

const daysAgo = (dateStr: string) => (Date.now() - new Date(`${dateStr}T00:00:00Z`).getTime()) / 86400000
const recencyWeight = (dateStr: string) => {
  const d = daysAgo(dateStr)
  if (d <= 14) return 1
  if (d <= 30) return 0.6
  return 0.3
}

// formHr: real HR count in the player's own last-10-real-games window (for
// a pitcher this naturally reads as his last 3-4 real starts, since
// lastNGameDates only counts dates he actually appears in). evidence: the
// real cross-referenced HRs attributed to THIS player specifically.
export function scoreFrom(formHr: number, evidence: { matchScore: number; game_date: string }[]): number {
  const formPoints = formHr >= 2 ? 4 : formHr === 1 ? 2 : 0
  const evidencePoints = Math.min(6, evidence.reduce((sum, r) => sum + r.matchScore * recencyWeight(r.game_date), 0) * 3)
  return Math.round(Math.max(0, Math.min(10, formPoints + evidencePoints)))
}
