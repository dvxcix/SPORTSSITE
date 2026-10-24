import type { NbaPublicMarketState } from '../nbaPublic'

// Executed in the existing cloud browser, never on the owner's laptop. Keep
// every runtime helper inside this function so page.evaluate can serialize it.
export async function runNbaPikkitScrape(options: { maxDurationMs?: number } | void = undefined) {
  const started = Date.now()
  const budget = Number.isFinite(options?.maxDurationMs) ? Math.max(0, Math.min(80000, options!.maxDurationMs!)) : 80000
  const deadline = started + budget
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(ms, deadline - Date.now()))))
  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const marketWords = /points?|rebounds?|assists?|threes?|steals?|blocks?|turnovers?|3.?point|double|triple/i
  const rowButtons = 'button[aria-label="expand-button"],button[aria-label="collapse-button"]'
  const firstGroups = new Set(['First Field Goal', 'First Basket (Incl. FT)'])
  function visible(element: Element) {
    if (element.closest('[hidden],[aria-hidden="true"]')) return false
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  }
  function findPanel() {
    const candidates: { select: HTMLSelectElement; panel: Element }[] = []
    for (const select of document.querySelectorAll('select')) {
      if (!visible(select) || Array.from(select.options).filter(option => marketWords.test(text(option))).length < 2) continue
      // Observed PlayerProps component: heading + select in the first child,
      // followed by the row list. Never read the surrounding For You content.
      for (let panel = select.parentElement; panel && panel !== document.body; panel = panel.parentElement) {
        const heading = panel.firstElementChild
        if (panel.children.length < 2 || !heading?.contains(select)) continue
        const title = Array.from(heading.querySelectorAll('*')).some(node => node.children.length === 0 && text(node) === 'Player Props' && visible(node))
        if (title) { candidates.push({ select, panel }); break }
      }
    }
    return candidates.length === 1 ? candidates[0] : null
  }
  function read(panel: Element) {
    const counts = new Map<string, number>()
    const conflicts = new Set<string>(), emptyGroups = new Set<string>(), observedGroups = new Set<string>()
    let invalid = 0, headers = 0
    function add(name: string, renderedCount: string) {
      const matched = renderedCount.match(/^(\d{1,3}(?:,\d{3})*|\d+) Picks?$/i)
      const count = renderedCount === '' ? 0 : matched ? Number(matched[1].replace(/,/g, '')) : NaN
      if (name.length < 3 || name.length > 160 || !Number.isSafeInteger(count) || count < 0 || count > 10000000 || conflicts.has(name)) { invalid++; return }
      if (counts.has(name) && counts.get(name) !== count) { counts.delete(name); conflicts.add(name); invalid++; return }
      counts.set(name, count)
    }
    for (const button of panel.querySelectorAll(rowButtons)) {
      if (!visible(button)) continue
      headers++
      const right = button.parentElement, header = right?.parentElement
      const nameNode = header?.firstElementChild, countNode = right?.firstElementChild
      // This is the exact gle header structure from the observed component.
      // Its expanded body also contains Yes/counts; those are not row totals.
      if (!header || header.children.length !== 2 || header.lastElementChild !== right || right?.children.length !== 2 || right.lastElementChild !== button || !nameNode || !countNode || nameNode === right || countNode === button || !visible(nameNode) || !visible(countNode)) { invalid++; continue }
      const name = text(nameNode), renderedCount = text(countNode)
      if (firstGroups.has(name)) {
        observedGroups.add(name)
        // These two headers are whole-market totals, not player counts. The
        // observed mle/rle components place each player's short_display_name
        // and num_picks in the first column of a direct outcome row.
        const row = header.parentElement, body = row?.children[1]
        if (button.getAttribute('aria-label') !== 'collapse-button' || !row || row.firstElementChild !== header || row.children.length !== 2 || !body || !visible(body)) { invalid++; continue }
        const outcomes = Array.from(body.children).filter(visible)
        if (outcomes.length && text(outcomes[0]) === 'Odds for this market are not available yet') { emptyGroups.add(name); continue }
        if (!outcomes.length) { invalid++; continue }
        for (const outcome of outcomes) {
          const left = outcome.firstElementChild, outcomeName = left?.firstElementChild, outcomeCount = left?.lastElementChild
          if (outcome.children.length !== 2 || !left || left.children.length !== 2 || !outcomeName || !outcomeCount || outcomeName === outcomeCount || outcomeName.children.length || outcomeCount.children.length || !visible(outcomeName) || !visible(outcomeCount)) { invalid++; continue }
          add(`${text(outcomeName)} ${name}`, text(outcomeCount))
        }
        continue
      }
      // The source formatter is v(0) === ''. Only a verified count node in a
      // real player header can establish zero; absent content cannot.
      add(name, renderedCount)
    }
    if (observedGroups.size > 0 && observedGroups.size !== firstGroups.size) invalid++
    const entries = [...counts].sort(([a], [b]) => a.localeCompare(b))
    // Only both observed first-basket groups with an explicit empty body prove
    // an empty category. No missing player name or blank page becomes a zero.
    const empty = entries.length === 0 && invalid === 0 && headers === 2 && observedGroups.size === 2 && emptyGroups.size === 2
    return { counts: Object.fromEntries(entries), rows: entries.length, invalid, headers, empty, fingerprint: JSON.stringify([entries, invalid, headers, [...emptyGroups].sort()]) }
  }
  function expandFirstGroup(panel: Element, attempted: Set<string>) {
    for (const button of panel.querySelectorAll(rowButtons)) {
      if (button.getAttribute('aria-label') !== 'expand-button' || !visible(button)) continue
      const right = button.parentElement, header = right?.parentElement, nameNode = header?.firstElementChild
      const name = text(nameNode ?? null)
      if (!firstGroups.has(name) || attempted.has(name) || header?.children.length !== 2 || header.lastElementChild !== right || right?.children.length !== 2 || right.lastElementChild !== button) continue
      attempted.add(name)
      ;(button as HTMLButtonElement).click()
      // React may replace the remaining nodes. Reacquire on the next poll;
      // never click odds, alerts, or an already expanded group.
      return
    }
  }
  let initial = findPanel()
  const discoveryDeadline = Math.min(deadline, started + 8000)
  while (!initial && Date.now() < discoveryDeadline) { await pause(Math.min(250, discoveryDeadline - Date.now())); initial = findPanel() }
  if (!initial) return {
    url: location.href, capturedAt: new Date().toISOString(), props: {}, complete: false, marketStates: [] as NbaPublicMarketState[],
    diagnostic: { reason: 'player-props-control-unavailable', selectCount: document.querySelectorAll('select').length },
  }
  const catalog = Array.from(initial.select.options).filter(option => option.value && !option.disabled && text(option)).map(option => ({ value: option.value, label: text(option) }))
  const uniqueCatalog = new Set(catalog.map(option => option.value)).size === catalog.length && new Set(catalog.map(option => option.label)).size === catalog.length
  if (!uniqueCatalog) return { url: location.href, capturedAt: new Date().toISOString(), props: {}, complete: false, marketStates: [] as NbaPublicMarketState[], diagnostic: { reason: 'ambiguous-market-options' } }
  // Preserve the already selected category before spending budget on siblings.
  const categories = [...catalog.filter(option => option.value === initial.select.value), ...catalog.filter(option => option.value !== initial.select.value)]
  const props: Record<string, Record<string, number>> = {}
  const marketStates: NbaPublicMarketState[] = []
  for (const option of categories) {
    if (Date.now() >= deadline) { marketStates.push({ ...option, status: 'deadline', rows: 0, observedAt: new Date().toISOString() }); continue }
    let current = findPanel()
    const matchingOption = current && Array.from(current.select.options).some(item => item.value === option.value && text(item) === option.label)
    if (!current || !matchingOption) { marketStates.push({ ...option, status: 'unavailable', rows: 0, observedAt: new Date().toISOString() }); continue }
    const before = read(current.panel), changed = current.select.value !== option.value
    if (changed) { current.select.value = option.value; current.select.dispatchEvent(new Event('change', { bubbles: true })) }
    const categoryDeadline = Math.min(deadline, Date.now() + 6000)
    const expandedGroups = new Set<string>()
    let previousFingerprint = '', stableSince = Date.now(), verified: ReturnType<typeof read> | null = null
    while (Date.now() < categoryDeadline) {
      current = findPanel()
      const selected = current && current.select.value === option.value && text(current.select.selectedOptions[0] ?? null) === option.label
      if (selected && current) expandFirstGroup(current.panel, expandedGroups)
      const snapshot = selected && current ? read(current.panel) : null
      // Setting select.value is not evidence React rendered its new category.
      // Unchanged prior headers are never relabelled as the requested market.
      const transitioned = snapshot && (!changed || before.headers === 0 || snapshot.fingerprint !== before.fingerprint)
      if (snapshot && transitioned && (snapshot.rows > 0 || snapshot.empty)) {
        if (snapshot.fingerprint !== previousFingerprint) { previousFingerprint = snapshot.fingerprint; stableSince = Date.now(); verified = null }
        else if (Date.now() - stableSince >= 500) {
          verified = snapshot
          if (snapshot.invalid === 0) break
        }
      } else { previousFingerprint = ''; stableSince = Date.now(); verified = null }
      await pause(Math.min(250, categoryDeadline - Date.now()))
    }
    // Recheck selection/content after the final wait as React may have replaced
    // the panel while that wait elapsed. Never publish an earlier panel state
    // with a newly selected category or a newly observed timestamp.
    const finalPanel = findPanel()
    if (verified && (!finalPanel || finalPanel.select.value !== option.value || text(finalPanel.select.selectedOptions[0] ?? null) !== option.label || read(finalPanel.panel).fingerprint !== verified.fingerprint)) verified = null
    if (verified) props[option.label] = verified.counts
    marketStates.push({ ...option, status: verified && verified.invalid === 0 ? verified.empty ? 'empty' : 'captured' : Date.now() >= deadline ? 'deadline' : 'unavailable', rows: verified?.rows ?? 0, observedAt: new Date().toISOString() })
  }
  return { url: location.href, capturedAt: new Date().toISOString(), props, complete: marketStates.length > 0 && marketStates.every(state => state.status === 'captured' || state.status === 'empty'), marketStates }
}
