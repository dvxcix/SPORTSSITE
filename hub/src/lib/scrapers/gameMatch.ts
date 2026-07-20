import type { Page } from 'playwright-core'

export function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// Finds a listing-page link/row for a specific game by matching BOTH teams'
// last-word nickname (e.g. "Pirates"/"Guardians" out of the full "Pittsburgh
// Pirates"/"Cleveland Guardians") against real interactive elements —
// deliberately not tied to any book's specific CSS classes, since those
// aren't knowable without live-inspecting each site and are exactly the
// kind of thing that breaks the moment a book ships a redesign. `legIndex`
// picks the Nth match, for a doubleheader where the same team pair appears
// twice on the listing page.
export async function findAndClickGame(page: Page, awayTeam: string, homeTeam: string, legIndex = 0): Promise<boolean> {
  const awayWord = escapeRe(awayTeam.split(' ').pop() || awayTeam)
  const homeWord = escapeRe(homeTeam.split(' ').pop() || homeTeam)
  const candidates = page.locator('a, [role="link"], [role="button"]')
    .filter({ hasText: new RegExp(awayWord, 'i') })
    .filter({ hasText: new RegExp(homeWord, 'i') })
  const count = await candidates.count()
  if (!count || legIndex >= count) return false
  await candidates.nth(legIndex).click({ timeout: 8000 })
  return true
}

// Pikkit's schedule list has a different shape than FD/MGM's — each team
// gets its OWN row (away team row, then home team row stacked directly
// below it), not one element containing both names, so findAndClickGame's
// "both teams in one element" match never finds anything here. The actual
// click target is the "More wagers →" link that follows each game's row
// pair. Locates the away team's row (by nickname, Nth occurrence for a
// doubleheader), then clicks the nearest "More wagers" link that follows
// it in document order.
export async function findAndClickPikkitGame(page: Page, awayTeam: string, homeTeam: string, legIndex = 0): Promise<boolean> {
  const awayWord = escapeRe(awayTeam.split(' ').pop() || awayTeam)
  const awayRow = page.getByText(new RegExp(awayWord, 'i')).nth(legIndex)
  if (!(await awayRow.count())) return false
  const wagersLink = awayRow.locator('xpath=following::*[contains(text(), "More wagers") or contains(text(), "more wagers")][1]')
  if (!(await wagersLink.count())) return false
  await wagersLink.click({ timeout: 8000 })
  return true
}

// Tracks how many times each team-pair has already been clicked during one
// run, so a doubleheader's second leg clicks the SECOND matching listing
// element instead of re-clicking the first. Call once per book-run, reuse
// across the games loop.
export function legIndexer() {
  const seen = new Map<string, number>()
  return (awayTeam: string, homeTeam: string) => {
    const key = `${awayTeam}@${homeTeam}`
    const idx = seen.get(key) ?? 0
    seen.set(key, idx + 1)
    return idx
  }
}

// Stateless equivalent of legIndexer() for the per-game invocation model —
// each game now scrapes in its own separate serverless invocation (fired
// concurrently rather than looped in one process), so there's no shared
// process memory to count clicks across a run.
//
// USED TO sort today's games by gamePk and rank this game within its team
// pairing — broke live on a real doubleheader: the Dodgers/Yankees game
// postponed the day before got made up as today's "Game 1" but landed a
// HIGHER gamePk (823523) than the already-separately-scheduled "Game 2"
// (823521), since gamePks are assigned in whatever order MLB's own systems
// create the schedule rows in, not necessarily gameNumber order. Sorting by
// gamePk ranked Game 2 first, so Game 1's dispatch-scrapes trigger clicked
// the SECOND "Dodgers @ Yankees" listing on FanDuel (the 7pm game) while
// still posting under Game 1's bare gameKey — the 7pm game's real odds
// silently landed mislabeled as Game 1's.
//
// gameKey itself already encodes the correct order — it's built from MLB's
// own explicit gameNumber field in mlbSchedule.ts (bare key for game 1,
// "-G2" for game 2, etc.), which is authoritative and doesn't depend on
// gamePk assignment order at all. Reading that suffix directly instead of
// re-deriving order from gamePk sidesteps the whole class of bug.
export function legIndexFor(target: { gameKey: string }): number {
  const m = /-G(\d+)$/.exec(target.gameKey)
  return m ? Number(m[1]) - 1 : 0
}

export async function clickTabByText(page: Page, label: string, exact = true): Promise<boolean> {
  const el = page.getByText(label, { exact }).first()
  if (!(await el.count())) return false
  await el.click({ timeout: 5000 }).catch(() => {})
  return true
}
