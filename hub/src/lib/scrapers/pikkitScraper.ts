// Faithful port of PIKKIT_HRPROPS.txt — same market list, same <select>
// change-event loop, same "N Picks" text-parsing regex. Assumes the page
// (a specific game's props view) is already loaded and the session is
// already signed in — Pikkit requires auth, unlike FD/MGM's public odds
// pages, which is why this always runs against a persisted Browserbase
// context (see browserbase.ts's createPersistentContext) rather than a
// fresh logged-out session.
export type PikkitScrapePayload = {
  url: string
  game: string
  capturedAt: string
  props: Record<string, Record<string, number>>
  marketLabels: Record<string, string>
  diagnostics?: { label: string; selectors: string[][]; touchdownLabels: string[]; controls: { label: string; tag: string; role: string | null; expanded: string | null }[] }[]
}

export async function runPikkitScrape(inspectTouchdowns: boolean | void = false): Promise<PikkitScrapePayload> {
  function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
  const out: PikkitScrapePayload = {
    url: location.href,
    game: document.title || location.href,
    capturedAt: new Date().toISOString(),
    props: {},
    marketLabels: {},
  }
  function parsePage(marketLabel: string): Record<string, number> {
    const nflCategory = /touchdown|\btd\b|passing|rushing|receiving|defensive|kicking/i.test(marketLabel)
    const t = document.body.innerText
    const ls = t.split('\n').map(l => l.trim()).filter(Boolean)
    const res: Record<string, number> = {}
    const touchdownSection = /^(?:(?:Anytime|First|1st|Last|Total|First Half|Second Half)\s+)(?:Touchdowns?|TDs?)(?:\s+Scorer)?$|^(?:TDs|Total Touchdowns)$/i
    const explicitTouchdown = /\s(?:(?:Anytime|First|1st|Last|Total|First Half|Second Half)\s+)?(?:Touchdowns?|TDs?)(?:\s+Scorer)?$/i
    let section: string | null = null
    for (let i = 0; i < ls.length; i++) {
      if (nflCategory && /touchdown|\btd\b/i.test(marketLabel) && touchdownSection.test(ls[i])) {
        section = ls[i]
        continue
      }
      const pm = ls[i].match(/^([\d,]+)\s+Picks?$/i)
      if (pm && i > 0) {
        let name = ls[i - 1]
          .replace(/\s+(?:Over|Under)\s+[+-]?\d+(?:\.\d+)?$/i, '')
          .replace(/ Home Runs$| Total Bases$| Bases$| Hits$| Singles$| Doubles$| Triples$| RBI$| Runs$| Stolen Bases$| Hits \+ Runs \+ RBI$/i, '')
          // NFL selectors contain multiple contracts in one category. Preserve
          // each row's suffix so First TD cannot collapse into Anytime TD.
          .replace(new RegExp(`\\s+${marketLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), suffix => nflCategory ? suffix : '')
          .trim()
        if (touchdownSection.test(name)) continue
        // Scorer sections repeat bare player names. Keep the section contract
        // in the key so First/Last cannot overwrite Anytime for that player.
        if (section && !explicitTouchdown.test(name)) name = `${name} ${section}`
        if (name && name.length > 2 && !/^(OVER|UNDER|Over|Under|\d)/.test(name)) res[name] = parseInt(pm[1].replace(/,/g, ''), 10)
      }
    }
    return res
  }
  // Used to be a hardcoded 6-market whitelist (home_runs/bases/hits_runs_rbi/
  // singles/doubles/hits) — RBI, Triples, and Stolen Base never got scraped
  // even though parsePage's own regex above already strips " RBI$"/
  // " Triples$"/" Stolen Bases$" from player names, meaning whoever wrote it
  // clearly expected those labels to show up. Confirmed live: pikkit_public_
  // picks has never once had a row for those three prop types, on any date
  // back to when scraping started — a real gap in what got scraped, not
  // Pikkit lacking the market. Walking every real <option> on the page's own
  // market <select> instead of a fixed list picks up whatever Pikkit
  // actually offers (however many markets that is) without needing to guess
  // each one's exact option value string.
  const selectors = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[]
  const marketWords = /touchdown|passing|rushing|receiving|reception|interception|field goal|home run|bases|hits|rbi|runs|stolen/i
  const sel = selectors
    .map(candidate => ({ candidate, score: Array.from(candidate.options).filter(option => marketWords.test(option.textContent ?? '') || marketWords.test(option.value)).length }))
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null
  if (!sel) return out
  const options = Array.from(sel.options).map(option => ({ value: option.value, label: option.textContent?.trim() || option.value })).filter(option => option.value)
  for (const option of options) {
    const value = option.value
    ;(sel as HTMLSelectElement).value = value
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    await sleep(900)
    let d = parsePage(option.label)
    // Large event pages can render the selector before the pick rows arrive.
    // Do not mistake an in-flight category load for an empty market.
    for (let attempt = 0; !Object.keys(d).length && attempt < 10; attempt++) {
      await sleep(400)
      d = parsePage(option.label)
    }
    if (Object.keys(d).length > 0) {
      out.props[value] = d
      out.marketLabels[value] = option.label
    }
    if (inspectTouchdowns && /touchdown/i.test(option.label)) {
      // Only exact market labels: no player names, account content, or raw DOM.
      const marketLabel = /^(?:(?:Anytime|First|1st|Last|Total|Player|Passing|Rushing|Receiving|First Half|Second Half)\s+)?(?:Touchdowns?|TDs?)(?:\s+Scorer)?$/i
      ;(out.diagnostics ??= []).push({
        label: option.label,
        selectors: Array.from(document.querySelectorAll('select')).map(select => Array.from(select.options).map(item => item.textContent?.trim() ?? '').filter(text => marketWords.test(text) && text.length < 60)),
        touchdownLabels: [...new Set(document.body.innerText.split('\n').map(text => text.trim()).filter(text => marketLabel.test(text)))],
        controls: Array.from(document.querySelectorAll('button,[role="button"],[aria-expanded]')).flatMap(node => {
          const label = node.textContent?.trim() ?? ''
          return marketLabel.test(label) ? [{ label, tag: node.tagName, role: node.getAttribute('role'), expanded: node.getAttribute('aria-expanded') }] : []
        }),
      })
    }
  }
  return out
}
