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
  const mkts: [string, string][] = [
    ['home_runs', 'hr'], ['bases', 'tb'], ['hits_runs_rbi', 'hrr'],
    ['singles', 'singles'], ['doubles', 'doubles'], ['hits', 'hits'],
  ]
  for (const [value, shortKey] of mkts) {
    const sel = document.querySelector('select')
    if (!sel) break
    ;(sel as HTMLSelectElement).value = value
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    await sleep(900)
    const d = parsePage()
    if (Object.keys(d).length > 0) out.props[shortKey] = d
  }
  return out
}
