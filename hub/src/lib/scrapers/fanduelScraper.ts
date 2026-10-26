// Faithful port of the user's own FDALLSCRAPE.txt bookmarklet, run via
// Playwright's page.evaluate() instead of pasted into DevTools by hand.
// Preserve the original market parsing and section expansion. MLB additionally
// verifies tab navigation: the SPA can replace tab nodes after each selection.
type FanduelBusyElement = {
  tag: 'div' | 'span' | 'svg' | 'progress' | 'main' | 'section' | 'aside' | 'other'
  role: 'progressbar' | 'status' | 'region' | 'complementary' | 'tabpanel' | 'button' | 'tab' | 'navigation' | 'main' | 'none' | 'other'
  labelKind: 'promotion' | 'loading' | 'none' | 'other'
  width: number; height: number; opacityPercent: number
  odds: number; sections: number; tabs: number
}
export type FanduelTabDiagnostic = {
  reason: 'selection-unverified' | 'root-unavailable' | 'busy' | 'no-content' | 'unchanged-content' | 'unstable-content' | 'empty-after-expansion' | 'deadline'
  scope: 'controlled-panel' | 'tabpanel' | 'main' | 'none'
  controlledPanels: number
  panels: number
  mains: number
  buttons: number
  odds: number
  sections: number
  busy: number
  busyNodes?: (FanduelBusyElement & { kind: 'aria-busy' | 'progressbar' | 'both'; relation: 'root' | 'descendant'; ancestors: FanduelBusyElement[] })[]
}
export type FanduelTabCapture = {
  sportsbook: string
  scraped_at: string
  event: { title: string; slug: string | null; event_id: string | null; url: string }
  active_tab: { label: string }
  section_count: number
  outcome_count: number
  sections: Record<string, { selection: string | null; market_hint: string | null; parts: string[]; odds: string; format: string; aria_label: string }[]>
  tab_status?: string
  incomplete?: boolean
  available_tabs?: string[]
  // Fixed reasons/counts only; failed tabs are private cron diagnostics, never
  // imported as prices. No DOM text, URLs, provider payloads or credentials.
  diagnostic?: FanduelTabDiagnostic
}
export async function runFanduelScrape(options: { maxDurationMs?: number; verifyTabs?: boolean } | void = undefined): Promise<FanduelTabCapture[]> {
  const deadline = options?.maxDurationMs ? Date.now() + options.maxDurationMs : Infinity
  const SLEEP = (ms: number) => new Promise(r => setTimeout(r, options?.verifyTabs ? Math.max(0, Math.min(ms, deadline - Date.now())) : ms))
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
      if (options?.verifyTabs && !visible(el)) continue
      const lab = el.getAttribute('aria-label') || ''
      const m = lab.match(/^Tab (\d+) of (\d+):\s*(.+)/)
      if (!m || seen.has(m[3])) continue
      seen.add(m[3])
      tabs.push({ el, index: +m[1], total: +m[2], label: m[3].trim() })
    }
    return tabs.sort((a, b) => a.index - b.index)
  }

  function visible(el: Element) {
    if (el.closest('[hidden], [aria-hidden="true"]')) return false
    let current: Element | null = el
    while (current) {
      const style = getComputedStyle(current)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      current = current.parentElement
    }
    return true
  }

  function contentRoot(label: string): ParentNode | null {
    if (!options?.verifyTabs) return document
    const tab = getAllTabDivs().find(item => item.label === label && item.el.getAttribute('aria-selected') === 'true')?.el
    if (!tab) return null
    const panelId = tab.getAttribute('aria-controls')
    if (panelId) {
      const panel = document.getElementById(panelId)
      return panel && visible(panel) ? panel : null
    }
    const panels = QSA('[role="tabpanel"]').filter(visible)
    if (panels.length) return panels.length === 1 ? panels[0] : null
    // The observed MLB event layout has selected role=button tabs without
    // aria-controls/tabpanel; its event content is inside the sole MAIN.
    const mains = QSA('main').filter(visible)
    return mains.length === 1 ? mains[0] : null
  }

  // The archive is intentionally market-agnostic. Visit every event tab,
  // including Plate Appearance, Player Combos, and Pitcher Props, so a new
  // ratio can be built later without changing and rerunning the scraper.
  function getCollapsedSections(root: ParentNode = document) {
    return QSA('[role="button"][aria-expanded="false"]', root).filter(el => {
      if (options?.verifyTabs && !visible(el)) return false
      const lab = el.getAttribute('aria-label')
      if (!lab || parseAriaLabel(lab)) return false
      if (/^Tab \d+ of \d+:/.test(lab)) return false
      if (/^(Promotion|Breadcrumbs|Edit Selections|More info|Log in|Play Free|Invite friends|Open Your Locker|Show all games|Back to top|Responsible Gaming|Add to betslip|Refer A Friend|FanDuel |Search|Sportsbook Home|Join FanDuel|\d+\+ live)/.test(lab)) return false
      return true
    })
  }
  async function expandAllSections(label: string) {
    for (let pass = 0; pass < MAX_EXPAND_PASSES; pass++) {
      if (Date.now() >= deadline) break
      const root = contentRoot(label)
      if (!root) break
      const collapsed = getCollapsedSections(root)
      if (!collapsed.length) break
      for (const el of collapsed) {
        if (Date.now() >= deadline) break
        try {
          ;(el as HTMLElement).scrollIntoView({ block: 'center' })
          ;(el as HTMLElement).click()
          await SLEEP(WAIT_AFTER_EXPAND)
        } catch { /* keep going — one bad section shouldn't stop the rest */ }
      }
    }
  }
  async function clickAllShowMore(label: string) {
    for (let round = 0; round < MAX_SHOW_MORE_ROUNDS; round++) {
      if (Date.now() >= deadline) break
      const root = contentRoot(label)
      if (!root) break
      const btns = QSA('button,[role="button"]', root).filter(b => {
        if (options?.verifyTabs && !visible(b)) return false
        const t = (b.textContent || '').trim().toLowerCase()
        return t === 'show more' || t === 'see more' || t === 'see all' || t === 'show all'
          || t.startsWith('show more') || t.startsWith('see more')
      })
      if (!btns.length) break
      for (const b of btns) {
        if (Date.now() >= deadline) break
        try {
          ;(b as HTMLElement).scrollIntoView({ block: 'center' })
          ;(b as HTMLElement).click()
          await SLEEP(WAIT_AFTER_SHOW_MORE)
        } catch { /* same as above */ }
      }
    }
  }

  function collectBetButtons(root: ParentNode = document) {
    const seen = new Set<string>()
    const out: { aria_label: string; odds: string; parts: string[]; format: string; section: string | null }[] = []
    for (const el of QSA('[role="button"][aria-selected]', root)) {
      if (options?.verifyTabs && !visible(el)) continue
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
    await expandAllSections(label)
    await clickAllShowMore(label)
    await expandAllSections(label)
    await SLEEP(300)
    return snapshotCurrentTab(label)
  }

  function snapshotCurrentTab(label: string) {
    const root = contentRoot(label)
    const outcomes = root ? collectBetButtons(root) : []
    const bySection: FanduelTabCapture['sections'] = {}
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

  function selectedTab(label: string) {
    const selected = getAllTabDivs().filter(tab => tab.el.getAttribute('aria-selected') === 'true')
    return selected.length === 1 && selected[0].label === label
  }

  function contentFingerprint(root: ParentNode) {
    return JSON.stringify([collectBetButtons(root).map(row => row.aria_label), getCollapsedSections(root).map(el => el.getAttribute('aria-label'))])
  }

  let readinessDiagnostic: FanduelTabDiagnostic | undefined
  function diagnose(reason: FanduelTabDiagnostic['reason'], label: string, root: ParentNode | null, odds = 0, sections = 0, busy = 0) {
    const tab = getAllTabDivs().find(item => item.label === label && item.el.getAttribute('aria-selected') === 'true')?.el
    const panelId = tab?.getAttribute('aria-controls'), panel = panelId ? document.getElementById(panelId) : null
    readinessDiagnostic = {
      reason,
      scope: !root ? 'none' : tab?.getAttribute('aria-controls') ? 'controlled-panel' : (root as Element).matches?.('[role="tabpanel"]') ? 'tabpanel' : 'main',
      controlledPanels: Number(!!panel && visible(panel)),
      panels: Math.min(20_000, QSA('[role="tabpanel"]').filter(visible).length),
      mains: Math.min(20_000, QSA('main').filter(visible).length),
      buttons: Math.min(20_000, root ? QSA('[role="button"][aria-selected]', root).filter(visible).length : 0),
      odds: Math.min(20_000, odds), sections: Math.min(20_000, sections), busy: Math.min(20_000, busy),
    }
  }

  // Structural evidence only, sampled once after a failed tab. Never use
  // these diagnostics to accept a busy market or copy arbitrary source data.
  function busyNodeDiagnostics(label: string): FanduelTabDiagnostic['busyNodes'] {
    const root = contentRoot(label)
    if (!root) return []
    const rootElement = root as Element
    const nodes = [...(rootElement.getAttribute?.('aria-busy') === 'true' ? [rootElement] : []), ...QSA('[aria-busy="true"], [role="progressbar"]', root).filter(visible)].slice(0, 8)
    const cache = new Map<Element, FanduelBusyElement>()
    const describe = (el: Element): FanduelBusyElement => {
      const cached = cache.get(el)
      if (cached) return cached
      const rawTag = el.tagName.toLowerCase(), rawRole = el.getAttribute('role'), label = el.getAttribute('aria-label') ?? ''
      const rect = el.getBoundingClientRect(), opacity = Number.parseFloat(getComputedStyle(el).opacity)
      const bounded = (value: number) => Number.isFinite(value) ? Math.min(20_000, Math.max(0, Math.round(value))) : 0
      const value: FanduelBusyElement = {
        tag: (['div', 'span', 'svg', 'progress', 'main', 'section', 'aside'].includes(rawTag) ? rawTag : 'other') as FanduelBusyElement['tag'],
        role: (!rawRole ? 'none' : ['progressbar', 'status', 'region', 'complementary', 'tabpanel', 'button', 'tab', 'navigation', 'main'].includes(rawRole) ? rawRole : 'other') as FanduelBusyElement['role'],
        labelKind: !label ? 'none' : /^promotions?\b/i.test(label) ? 'promotion' : /^(?:loading|please wait)\b/i.test(label) ? 'loading' : 'other',
        width: bounded(rect.width), height: bounded(rect.height), opacityPercent: Number.isFinite(opacity) ? Math.min(100, Math.max(0, Math.round(opacity * 100))) : -1,
        odds: bounded(QSA('[role="button"][aria-selected]', el).filter(node => visible(node) && !!parseAriaLabel(node.getAttribute('aria-label'))).length),
        sections: bounded(getCollapsedSections(el).length),
        tabs: bounded(QSA('[aria-label]', el).filter(node => visible(node) && /^Tab \d+ of \d+:/.test(node.getAttribute('aria-label') ?? '')).length),
      }
      cache.set(el, value)
      return value
    }
    return nodes.map((el): NonNullable<FanduelTabDiagnostic['busyNodes']>[number] => {
      const ancestors: FanduelBusyElement[] = []
      let parent = el === rootElement ? null : el.parentElement
      while (parent && ancestors.length < 6) {
        ancestors.push(describe(parent))
        if (parent === rootElement) break
        parent = parent.parentElement
      }
      return { ...describe(el), kind: el.getAttribute('aria-busy') === 'true' ? el.getAttribute('role') === 'progressbar' ? 'both' : 'aria-busy' : 'progressbar', relation: el === rootElement ? 'root' : 'descendant', ancestors }
    })
  }

  // Check readiness twice with the selected tab still mounted. A spinner or
  // a blank container is not evidence that a market has been withdrawn.
  async function waitForTabContent(label: string, until: number, priorTabContent?: string) {
    let prior = ''
    while (Date.now() < Math.min(until, deadline)) {
      if (!selectedTab(label)) { diagnose('selection-unverified', label, null); return false }
      const root = contentRoot(label)
      if (!root) { diagnose('root-unavailable', label, null); return false }
      const busyCount = QSA('[aria-busy="true"], [role="progressbar"]', root).filter(visible).length
        + Number((root as Element).getAttribute?.('aria-busy') === 'true')
      const busy = busyCount > 0
      const outcomes = collectBetButtons(root), sections = getCollapsedSections(root)
      const fingerprint = contentFingerprint(root)
      const hasContent = (outcomes.length > 0 || sections.length > 0) && fingerprint !== priorTabContent
      if (!busy && hasContent && fingerprint === prior) return true
      diagnose(busy ? 'busy' : !outcomes.length && !sections.length ? 'no-content' : fingerprint === priorTabContent ? 'unchanged-content' : 'unstable-content', label, root, outcomes.length, sections.length, busyCount)
      prior = !busy && hasContent ? fingerprint : ''
      await SLEEP(250)
    }
    return false
  }

  if (options?.verifyTabs) {
    const labels = getAllTabDivs().map(tab => tab.label)
    const initial = getAllTabDivs().find(tab => tab.el.getAttribute('aria-selected') === 'true')?.label
    const ordered = initial ? [initial, ...labels.filter(label => label !== initial)] : labels
    const results: FanduelTabCapture[] = []
    for (const label of ordered) {
      readinessDiagnostic = undefined
      let status = 'selection-unverified'
      let captured: Awaited<ReturnType<typeof scrapeCurrentTab>> | null = null
      let priorTabContent: string | undefined
      // Retry at most once, reacquiring the element even when the first click
      // detached it. Never reuse the original event's tab Element references.
      for (let attempt = 0; attempt < 2 && Date.now() < deadline; attempt++) {
        if (!selectedTab(label) || attempt > 0) {
          const current = getAllTabDivs().find(tab => tab.label === label)?.el
          if (!current) break
          if (!selectedTab(label) && !current.getAttribute('aria-controls')) {
            const previous = getAllTabDivs().find(tab => tab.el.getAttribute('aria-selected') === 'true')
            const previousRoot = previous && contentRoot(previous.label)
            if (previousRoot) priorTabContent = contentFingerprint(previousRoot)
          }
          try {
            ;(current as HTMLElement).scrollIntoView({ block: 'center' })
            ;(current as HTMLElement).click()
          } catch { continue }
          await SLEEP(WAIT_AFTER_TAB_CLICK)
        }
        if (!selectedTab(label)) continue
        status = 'content-unavailable'
        if (!await waitForTabContent(label, Date.now() + 4000, priorTabContent)) continue
        const scrape = await scrapeCurrentTab(label)
        if (Date.now() >= deadline) break
        if (!selectedTab(label)) { status = 'selection-unverified'; continue }
        if (scrape.outcome_count && await waitForTabContent(label, Date.now() + 2000, priorTabContent)) {
          // Capture again after the final readiness check, so delayed content
          // updates are not mislabeled with the prior tab's observations.
          captured = snapshotCurrentTab(label)
          if (Date.now() < deadline && selectedTab(label) && captured.outcome_count) { status = 'captured'; break }
          captured = null
        }
        if (!scrape.outcome_count) diagnose('empty-after-expansion', label, contentRoot(label))
      }
      if (Date.now() >= deadline) { status = 'deadline'; captured = null }
      if (status !== 'captured' && (status === 'deadline' || !readinessDiagnostic)) diagnose(status === 'deadline' ? 'deadline' : 'selection-unverified', label, null)
      const failedDiagnostic = readinessDiagnostic as FanduelTabDiagnostic | undefined
      if (status !== 'captured' && failedDiagnostic?.reason === 'busy') {
        try { failedDiagnostic.busyNodes = busyNodeDiagnostics(label) } catch { /* Diagnostics cannot change the failed capture or its deadline. */ }
      }
      results.push({
        ...(captured ?? { sportsbook: 'FanDuel', scraped_at: new Date().toISOString(), event: eventHeader(), active_tab: { label }, section_count: 0, outcome_count: 0, sections: {} }),
        tab_status: status, incomplete: status !== 'captured', available_tabs: labels,
        ...(status !== 'captured' ? { diagnostic: readinessDiagnostic } : {}),
      })
    }
    return results
  }

  const allScrapes: FanduelTabCapture[] = []
  const allTabs = getAllTabDivs()
  const wanted = allTabs

  const activeEl = QSA('[aria-label]').find(e => {
    const lab = e.getAttribute('aria-label') || ''
    return e.tagName !== 'A' && /^Tab \d+ of \d+:/.test(lab) && e.getAttribute('aria-selected') === 'true'
  })
  const activeLabel = activeEl
    ? (activeEl.getAttribute('aria-label')!.match(/Tab \d+ of \d+:\s*(.+)/) || [])[1]?.trim()
    : null

  if (activeLabel) {
    allScrapes.push(await scrapeCurrentTab(activeLabel))
  }

  for (let i = 0; i < wanted.length; i++) {
    if (Date.now() >= deadline) break
    const { el, label } = wanted[i]
    if (label === activeLabel) continue
    ;(el as HTMLElement).scrollIntoView({ block: 'center' })
    ;(el as HTMLElement).click()
    await SLEEP(WAIT_AFTER_TAB_CLICK)
    allScrapes.push(await scrapeCurrentTab(label))
  }

  return allScrapes.map(scrape => ({ ...scrape, ...(options?.maxDurationMs ? { incomplete: Date.now() >= deadline, available_tabs: wanted.map(tab => tab.label) } : {}) }))
}
