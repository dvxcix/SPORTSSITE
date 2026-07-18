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

export async function clickTabByText(page: Page, label: string, exact = true): Promise<boolean> {
  const el = page.getByText(label, { exact }).first()
  if (!(await el.count())) return false
  await el.click({ timeout: 5000 }).catch(() => {})
  return true
}
