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
}

export async function runPikkitScrape(): Promise<PikkitScrapePayload> {
  function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
  const out: PikkitScrapePayload = {
    url: location.href,
    game: document.title || location.href,
    capturedAt: new Date().toISOString(),
    props: {},
    marketLabels: {},
  }
  function parsePage(marketLabel: string): Record<string, number> {
    const t = document.body.innerText
    const ls = t.split('\n').map(l => l.trim()).filter(Boolean)
    const res: Record<string, number> = {}
    for (let i = 1; i < ls.length; i++) {
      const pm = ls[i].match(/^([\d,]+)\s+Picks?$/)
      if (pm) {
        const name = ls[i - 1]
          .replace(/\s+(?:Over|Under)\s+[+-]?\d+(?:\.\d+)?$/i, '')
          .replace(/ Home Runs$| Total Bases$| Bases$| Hits$| Singles$| Doubles$| Triples$| RBI$| Runs$| Stolen Bases$| Hits \+ Runs \+ RBI$/i, '')
          .replace(/ Anytime(?: First Half)? Touchdown(?: Scorer)?$| First Touchdown(?: Scorer)?$| Touchdowns?$| Passing Yards$| Passing Touchdowns?$| Passing Attempts?$| Passing Completions?$| Interceptions?$| Rushing Yards$| Rushing Attempts?$| Receiving Yards$| Receptions?$| Rushing \+ Receiving Yards$| Rush \+ Receiving Yards$| Longest Reception$| Longest Rush$| Field Goals Made$| Kicking Points$/i, '')
          .replace(new RegExp(`\\s+${marketLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '')
          .trim()
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
    const d = parsePage(option.label)
    if (Object.keys(d).length > 0) {
      out.props[value] = d
      out.marketLabels[value] = option.label
    }
  }
  return out
}
