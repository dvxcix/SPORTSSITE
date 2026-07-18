// Faithful port of the user's own FDALLSCRAPE.txt bookmarklet, run via
// Playwright's page.evaluate() instead of pasted into DevTools by hand.
// Every selector/timing constant is unchanged from the original — this was
// reverse-engineered by hand against FanDuel's real DOM, so don't "clean up"
// the logic here without testing against a live page first. Dropped only
// the on-page debug overlay and the auto-download-a-.json-file side effect,
// neither of which make sense running headless.
export async function runFanduelScrape(): Promise<any[]> {
  const SLEEP = (ms: number) => new Promise(r => setTimeout(r, ms))
  const QSA = (sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)]

  const WAIT_AFTER_EXPAND = 200
  const WAIT_AFTER_SHOW_MORE = 400
  const WAIT_AFTER_TAB_CLICK = 2500
  const MAX_EXPAND_PASSES = 8
  const MAX_SHOW_MORE_ROUNDS = 10

  const ODDS_TAIL = /^([+-]\d{2,5}|Even|EVEN|even)$/
  function parseAriaLabel(label: string | null): { odds: string; parts: string[]; format: 'A' | 'B' } | null {
    if (!label) return null
    if (label.endsWith(' Odds')) {
      const core = label.replace(/\s*Odds\s*$/, '')
      const parts = core.split(',').map(s => s.trim()).filter(Boolean)
      if (parts.length < 2) return null
      const odds = parts[parts.length - 1]
      if (!ODDS_TAIL.test(odds)) return null
      return { odds, parts: parts.slice(0, -1), format: 'A' }
    }
    const parts = label.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length < 2) return null
    const last = parts[parts.length - 1]
    if (!ODDS_TAIL.test(last)) return null
    return { odds: last, parts: parts.slice(0, -1), format: 'B' }
  }

  function eventHeader() {
    const h1 = document.querySelector('h1')
    const title = h1 ? (h1.textContent || '').trim() : document.title
    const crumb = document.querySelector('nav[aria-label="Breadcrumbs"] a[aria-current="page"]')
    const slug = crumb ? crumb.getAttribute('href') : null
    const idMatch = slug ? slug.match(/(\d{6,})/) : null
    return { title, slug, event_id: idMatch ? idMatch[1] : null, url: location.href }
  }

  function getAllTabDivs() {
    const seen = new Set<string>()
    const tabs: { el: Element; index: number; total: number; label: string }[] = []
    for (const el of QSA('div[aria-label], [role="tab"][aria-label], [role="button"][aria-label]')) {
      if (el.tagName === 'A') continue
      const lab = el.getAttribute('aria-label') || ''
      const m = lab.match(/^Tab (\d+) of (\d+):\s*(.+)/)
      if (!m || seen.has(m[3])) continue
      seen.add(m[3])
      tabs.push({ el, index: +m[1], total: +m[2], label: m[3].trim() })
    }
    return tabs.sort((a, b) => a.index - b.index)
  }

  const SKIP = ['pitcher props', 'game props', 'popular', 'futures']
  function wantTab(label: string) {
    const lo = label.toLowerCase()
    return !SKIP.some(s => lo.includes(s))
  }

  function getCollapsedSections() {
    return QSA('[role="button"][aria-expanded="false"]').filter(el => {
      const lab = el.getAttribute('aria-label')
      if (!lab || parseAriaLabel(lab)) return false
      if (/^Tab \d+ of \d+:/.test(lab)) return false
      if (/^(Promotion|Breadcrumbs|Edit Selections|More info|Log in|Play Free|Invite friends|Open Your Locker|Show all games|Back to top|Responsible Gaming|Add to betslip|Refer A Friend|FanDuel |Search|Sportsbook Home|Join FanDuel|\d+\+ live)/.test(lab)) return false
      return true
    })
  }
  async function expandAllSections() {
    for (let pass = 0; pass < MAX_EXPAND_PASSES; pass++) {
      const collapsed = getCollapsedSections()
      if (!collapsed.length) break
      for (const el of collapsed) {
        try {
          ;(el as HTMLElement).scrollIntoView({ block: 'center' })
          ;(el as HTMLElement).click()
          await SLEEP(WAIT_AFTER_EXPAND)
        } catch { /* keep going — one bad section shouldn't stop the rest */ }
      }
    }
  }
  async function clickAllShowMore() {
    for (let round = 0; round < MAX_SHOW_MORE_ROUNDS; round++) {
      const btns = QSA('button,[role="button"]').filter(b => {
        const t = (b.textContent || '').trim().toLowerCase()
        return t === 'show more' || t === 'see more' || t === 'see all' || t === 'show all'
          || t.startsWith('show more') || t.startsWith('see more')
      })
      if (!btns.length) break
      for (const b of btns) {
        try {
          ;(b as HTMLElement).scrollIntoView({ block: 'center' })
          ;(b as HTMLElement).click()
          await SLEEP(WAIT_AFTER_SHOW_MORE)
        } catch { /* same as above */ }
      }
    }
  }

  function collectBetButtons() {
    const seen = new Set<string>()
    const out: { aria_label: string; odds: string; parts: string[]; format: string; section: string | null }[] = []
    for (const el of QSA('[role="button"][aria-selected]')) {
      const lab = el.getAttribute('aria-label')
      if (!lab || seen.has(lab)) continue
      const parsed = parseAriaLabel(lab)
      if (!parsed) continue
      seen.add(lab)
      let sectionName: string | null = null
      let cur: Element | null = el
      outer: for (let i = 0; i < 30 && cur; i++) {
        let sib: Element | null = cur.previousElementSibling
        while (sib) {
          const hdr = sib.matches?.('[role="button"][aria-expanded][aria-label]')
            ? sib : sib.querySelector?.('[role="button"][aria-expanded][aria-label]')
          if (hdr) {
            const lbl = hdr.getAttribute('aria-label')
            if (lbl && !parseAriaLabel(lbl) && !/^Tab \d+ of/.test(lbl) && !/^Promotion/.test(lbl)) {
              sectionName = lbl
              break outer
            }
          }
          sib = sib.previousElementSibling
        }
        cur = cur.parentElement
      }
      if (!sectionName && parsed.format === 'B' && parsed.parts.length >= 2) sectionName = parsed.parts[0]
      out.push({ aria_label: lab, odds: parsed.odds, parts: parsed.parts, format: parsed.format, section: sectionName })
    }
    return out
  }

  async function scrapeCurrentTab(label: string) {
    await expandAllSections()
    await clickAllShowMore()
    await expandAllSections()
    await SLEEP(300)
    const outcomes = collectBetButtons()
    const bySection: Record<string, any[]> = {}
    for (const o of outcomes) {
      const k = o.section || '(ungrouped)'
      const selectionParts = o.parts.slice(1)
      ;(bySection[k] = bySection[k] || []).push({
        selection: selectionParts.join(' | ') || o.parts[0] || null,
        market_hint: o.parts[0] || null,
        parts: o.parts, odds: o.odds, format: o.format, aria_label: o.aria_label,
      })
    }
    return {
      sportsbook: 'FanDuel',
      scraped_at: new Date().toISOString(),
      event: eventHeader(),
      active_tab: { label },
      section_count: Object.keys(bySection).length,
      outcome_count: outcomes.length,
      sections: bySection,
    }
  }

  const allScrapes: any[] = []
  const allTabs = getAllTabDivs()
  const wanted = allTabs.filter(t => wantTab(t.label))

  const activeEl = QSA('[aria-label]').find(e => {
    const lab = e.getAttribute('aria-label') || ''
    return e.tagName !== 'A' && /^Tab \d+ of \d+:/.test(lab) && e.getAttribute('aria-selected') === 'true'
  })
  const activeLabel = activeEl
    ? (activeEl.getAttribute('aria-label')!.match(/Tab \d+ of \d+:\s*(.+)/) || [])[1]?.trim()
    : null

  if (activeLabel && wantTab(activeLabel)) {
    allScrapes.push(await scrapeCurrentTab(activeLabel))
  }

  for (let i = 0; i < wanted.length; i++) {
    const { el, label } = wanted[i]
    if (label === activeLabel) continue
    ;(el as HTMLElement).scrollIntoView({ block: 'center' })
    ;(el as HTMLElement).click()
    await SLEEP(WAIT_AFTER_TAB_CLICK)
    allScrapes.push(await scrapeCurrentTab(label))
  }

  return allScrapes
}
