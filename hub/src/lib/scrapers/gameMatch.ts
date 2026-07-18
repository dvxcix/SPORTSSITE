import type { Page } from 'playwright-core'

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

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
// process memory to count clicks across a run. Instead, derives the same
// leg index purely from today's full games list: among every game sharing
// this team pairing (a doubleheader), sorts by gamePk and returns this
// game's rank. Deterministic — every invocation that fetches the same
// games list computes the identical index for a given gamePk.
export function legIndexFor(games: { gamePk: number; awayTeam: string; homeTeam: string }[], target: { gamePk: number; awayTeam: string; homeTeam: string }): number {
  const pair = games
    .filter(g => g.awayTeam === target.awayTeam && g.homeTeam === target.homeTeam)
    .sort((a, b) => a.gamePk - b.gamePk)
  return Math.max(0, pair.findIndex(g => g.gamePk === target.gamePk))
}

export async function clickTabByText(page: Page, label: string, exact = true): Promise<boolean> {
  const el = page.getByText(label, { exact }).first()
  if (!(await el.count())) return false
  await el.click({ timeout: 5000 }).catch(() => {})
  return true
}
