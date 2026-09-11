import type { Page } from 'playwright-core'

export function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// A single trailing word isn't always a unique nickname — "Chicago White Sox"
// and "Boston Red Sox" both end in "Sox". Confirmed live: on a slate where
// both are playing the same day, findAndClickPikkitGame's own away-team match
// (built from just the last word) matched Red Sox's row instead of White
// Sox's, clicking the wrong game's "More wagers" link entirely. The last TWO
// words ("White Sox" / "Red Sox") disambiguate every real MLB city+nickname
// pair without needing a hardcoded team list.
export function distinguishingSuffix(team: string): string {
  const words = team.trim().split(/\s+/)
  return words.length > 1 ? words.slice(-2).join(' ') : team
}

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
  const away = distinguishingSuffix(awayTeam).toLowerCase()
  const home = distinguishingSuffix(homeTeam).toLowerCase()
  const links = page.locator('a, button, [role="link"], [role="button"]').filter({ hasText: /more wagers/i })
  const ranked: Array<{ index: number; depth: number; textLength: number }> = []
  for (let index = 0; index < await links.count(); index++) {
    const match = await links.nth(index).evaluate((element, teams) => {
      let node: HTMLElement | null = element as HTMLElement
      // Pikkit has changed the nesting depth of its event cards more than
      // once. Eight parents was enough for the old card but now leaves valid
      // games invisible. Walk farther, while ranking the smallest matching
      // ancestor so the page/root container can never turn every link into a
      // false match merely because both team names occur elsewhere.
      for (let depth = 0; node && depth < 16; depth++, node = node.parentElement) {
        const text = (node.innerText || '').toLowerCase()
        if (text.includes(teams.away) && text.includes(teams.home)) {
          const wagerControls = Array.from(node.querySelectorAll('a, button, [role="link"], [role="button"]'))
            .filter(control => /more wagers/i.test((control.textContent || '').trim())).length
          // A game card has one wager control (occasionally two responsive
          // variants). A slate/root wrapper has one for every game and must
          // never qualify as the shared team container.
          if (wagerControls <= 2) return { depth, textLength: text.length }
        }
      }
      return null
    }, { away, home }).catch(() => null)
    if (match) ranked.push({ index, ...match })
  }
  ranked.sort((a, b) => a.textLength - b.textLength || a.depth - b.depth || a.index - b.index)
  let target = ranked[legIndex]

  // Some responsive/list variants render the two team rows as siblings and
  // put the wager control after both, with no small shared card ancestor.
  // In that shape the ancestor matcher above correctly rejects the broad
  // slate wrapper. Fall back to document order: for every wager control,
  // find the nearest preceding away-team leaf and require the home team to
  // occur inside the short DOM range between them. This preserves the
  // critical both-team check while supporting Pikkit's row-pair layout.
  if (!target) {
    const fallbackIndexes = await page.evaluate(({ away, home }) => {
      const controls = Array.from(document.querySelectorAll<HTMLElement>('a, button, [role="link"], [role="button"]'))
        .filter(control => /more wagers/i.test((control.textContent || '').trim()))
      const leaves = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(element => {
        const text = (element.textContent || '').trim().toLowerCase()
        if (!text.includes(away) || text.length > 120) return false
        return !Array.from(element.children).some(child => (child.textContent || '').trim().toLowerCase().includes(away))
      })
      return controls.flatMap((control, controlIndex) => {
        let bestLength = Number.POSITIVE_INFINITY
        for (const leaf of leaves) {
          if (!(leaf.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING)) continue
          const range = document.createRange()
          range.setStartBefore(leaf)
          range.setEndAfter(control)
          const text = (range.cloneContents().textContent || '').trim().toLowerCase()
          if (text.length <= 2500 && text.includes(home)) bestLength = Math.min(bestLength, text.length)
        }
        return Number.isFinite(bestLength) ? [{ controlIndex, bestLength }] : []
      }).sort((a, b) => a.bestLength - b.bestLength || a.controlIndex - b.controlIndex)
        .map(candidate => candidate.controlIndex)
    }, { away, home }).catch(() => [] as number[])
    const fallbackIndex = fallbackIndexes[legIndex]
    if (fallbackIndex != null) target = { index: fallbackIndex, depth: 99, textLength: 0 }
  }

  if (!target) return false
  await links.nth(target.index).click({ timeout: 8000 })
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
