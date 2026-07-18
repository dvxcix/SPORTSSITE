import type { Page } from 'playwright-core'

// The in-page scrape itself is a faithful port of BetMGMHomeRunScraper.txt
// — same DOM walk (name block -> next-sibling ms-option for the odds), same
// selectors. The ORIGINAL script assumed a human had already clicked
// "Batter home runs" open and picked a threshold tab; scrapeMgmGame() below
// does that part for real via Playwright before calling this twice (once
// per threshold), since a headless run can't rely on that having happened
// already.
async function runMgmScrapeCurrentTab(): Promise<any | null> {
  const ODDS_RE = /^[+-]\d{2,5}$/

  let targetId: string | null = null
  document.querySelectorAll('button[aria-controls]').forEach(btn => {
    if ((btn.textContent || '').toLowerCase().includes('batter home runs')) {
      targetId = btn.getAttribute('aria-controls')
    }
  })
  if (!targetId) return null
  const content = document.getElementById(targetId)
  if (!content) return null

  let threshold = 'unknown'
  const selectedTab = content.querySelector('[aria-selected="true"]') || document.querySelector('.ds-tab-header [aria-selected="true"]')
  if (selectedTab) threshold = (selectedTab.textContent || '').trim()

  const nameBlocks = Array.from(content.querySelectorAll('div.attribute-key.player-statistics'))
  const outcomes: { player_name: string; avg_hr_per_game: string | null; odds: string | null }[] = []
  for (const block of nameBlocks) {
    const nameEl = block.querySelector('.title')
    const avgEl = block.querySelector('.player-stats-value')
    const player_name = nameEl ? (nameEl.textContent || '').trim() : null
    const avg = avgEl ? (avgEl.textContent || '').trim() : null
    if (!player_name) continue

    let sib: Element | null = block.nextElementSibling
    let odds: string | null = null
    for (let i = 0; i < 3 && sib; i++) {
      if (sib.tagName === 'MS-OPTION' || sib.querySelector?.('ms-option, ms-font-resizer')) {
        const oddsEl = [...sib.querySelectorAll('*')].find(el => el.children.length === 0 && ODDS_RE.test((el.textContent || '').trim()))
        if (oddsEl) { odds = (oddsEl.textContent || '').trim(); break }
      }
      if (sib.tagName === 'DIV' && sib.classList.contains('attribute-key')) break
      sib = sib.nextElementSibling
    }

    outcomes.push({ player_name, avg_hr_per_game: avg, odds })
  }

  return {
    sportsbook: 'BetMGM',
    scraped_at: new Date().toISOString(),
    url: location.href,
    market: 'Batter home runs',
    threshold,
    outcome_count: outcomes.length,
    outcomes,
  }
}

// Navigates to a BetMGM event page, expands "Batter home runs" if needed,
// scrapes whichever threshold is showing, then switches to the other
// threshold tab and scrapes again — matching how the manual workflow
// covers both 1+ and 2+ HR by re-running the bookmarklet per tab.
// Clicks every "Show more"/"See more" control currently on screen so the
// full batter list is present before scraping — the accordion only shows a
// partial list otherwise (confirmed: this is a real extra manual step in
// the human workflow, not covered by the original bookmarklet since it
// assumed a person had already clicked through by the time they ran it).
async function clickShowMore(page: Page) {
  for (let i = 0; i < 5; i++) {
    const btn = page.getByText(/show more|see more/i).first()
    if (!(await btn.count())) break
    await btn.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
  }
}

export async function scrapeMgmGame(page: Page, eventUrl: string): Promise<any[]> {
  await page.goto(eventUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  const header = page.locator('button[aria-controls]').filter({ hasText: /batter home runs/i }).first()
  if (await header.count()) {
    const expanded = await header.getAttribute('aria-expanded')
    if (expanded !== 'true') {
      await header.click()
      await page.waitForTimeout(800)
    }
  }
  await clickShowMore(page)

  const results: any[] = []
  const first = await page.evaluate(runMgmScrapeCurrentTab)
  if (first) results.push(first)

  // Whichever threshold wasn't captured above — click its tab by exact text
  // match ("1+" or "2+") and scrape again. Best-effort: if the tab control
  // isn't where expected, this just silently returns only one threshold's
  // worth of data instead of throwing and losing the first result.
  const otherLabel = first?.threshold?.trim() === '1+' ? '2+' : '1+'
  const otherTab = page.getByText(otherLabel, { exact: true }).first()
  if (await otherTab.count()) {
    await otherTab.click()
    await page.waitForTimeout(1000)
    await clickShowMore(page)
    const second = await page.evaluate(runMgmScrapeCurrentTab)
    if (second) results.push(second)
  }

  return results
}
