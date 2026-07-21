// Faithful port of PIKKIT_HRPROPS.txt — same market list, same <select>
// change-event loop, same "N Picks" text-parsing regex. Assumes the page
// (a specific game's props view) is already loaded and the session is
// already signed in — Pikkit requires auth, unlike FD/MGM's public odds
// pages, which is why this always runs against a persisted Browserbase
// context (see browserbase.ts's createPersistentContext) rather than a
// fresh logged-out session.
export async function runPikkitScrape(): Promise<{ url: string; game: string; props: Record<string, Record<string, number>> }> {
  function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
  const out: { url: string; game: string; props: Record<string, Record<string, number>> } = {
    url: location.href, game: document.title || location.href, props: {},
  }
  function parsePage(): Record<string, number> {
    const t = document.body.innerText
    const ls = t.split('\n').map(l => l.trim()).filter(Boolean)
    const res: Record<string, number> = {}
    for (let i = 1; i < ls.length; i++) {
      const pm = ls[i].match(/^([\d,]+)\s+Picks?$/)
      if (pm) {
        const name = ls[i - 1].replace(/ Home Runs$| Total Bases$| Bases$| Hits$| Singles$| Doubles$| Triples$| RBI$| Runs$| Stolen Bases$| Hits \+ Runs \+ RBI$/, '').trim()
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
  const sel = document.querySelector('select')
  if (!sel) return out
  const values = Array.from((sel as HTMLSelectElement).options).map(o => o.value).filter(Boolean)
  for (const value of values) {
    ;(sel as HTMLSelectElement).value = value
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    await sleep(900)
    const d = parsePage()
    if (Object.keys(d).length > 0) out.props[value] = d
  }
  return out
}
