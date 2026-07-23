import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normName } from '@/lib/nameNorm'

// Full franchise names as they appear in FanDuel's own event.title (e.g.
// "Colorado Rockies @ San Francisco Giants Player Combos Odds") — used to
// detect which REAL game each pasted scrape belongs to, instead of trusting
// whatever game was selected in the dropdown when the request was sent. A
// single window.__fdAllScrapes paste that accumulated scrapes from several
// different game pages during one browsing session used to get every
// player, from every one of those games, tagged with just the one game
// selected at submit time — confirmed in production: Orioles/Royals/
// Phillies/Nationals/Yankees players all ended up saved under game_key
// 'CHC@CIN' after a combined multi-game paste. Sorted longest-first so
// "Chicago White Sox" matches before a hypothetical shorter overlapping
// name would.
const TEAM_NAME_TO_ABBR_RAW: [string, string][] = [
  ['Arizona Diamondbacks', 'AZ'], ['Atlanta Braves', 'ATL'], ['Baltimore Orioles', 'BAL'],
  ['Boston Red Sox', 'BOS'], ['Chicago Cubs', 'CHC'], ['Chicago White Sox', 'CWS'],
  ['Cincinnati Reds', 'CIN'], ['Cleveland Guardians', 'CLE'], ['Colorado Rockies', 'COL'],
  ['Detroit Tigers', 'DET'], ['Houston Astros', 'HOU'], ['Kansas City Royals', 'KC'],
  ['Los Angeles Angels', 'LAA'], ['Los Angeles Dodgers', 'LAD'], ['Miami Marlins', 'MIA'],
  ['Milwaukee Brewers', 'MIL'], ['Minnesota Twins', 'MIN'], ['New York Mets', 'NYM'],
  ['New York Yankees', 'NYY'], ['Athletics', 'ATH'], ['Philadelphia Phillies', 'PHI'],
  ['Pittsburgh Pirates', 'PIT'], ['San Diego Padres', 'SD'], ['San Francisco Giants', 'SF'],
  ['Seattle Mariners', 'SEA'], ['St. Louis Cardinals', 'STL'], ['Tampa Bay Rays', 'TB'],
  ['Texas Rangers', 'TEX'], ['Toronto Blue Jays', 'TOR'], ['Washington Nationals', 'WSH'],
]
const TEAM_NAME_TO_ABBR: [string, string][] = [...TEAM_NAME_TO_ABBR_RAW].sort((a, b) => b[0].length - a[0].length)

// Finds the two team names in a scrape's event.title and returns them in
// the order they appear ("Away @ Home ..."), matching how FanDuel titles
// every event page. Returns null if the title doesn't contain exactly two
// recognizable team names (so the caller can fall back to the dropdown).
function detectGameFromTitle(title: string | undefined | null): { awayAbbr: string; homeAbbr: string; gameKey: string } | null {
  if (!title) return null
  const found: { abbr: string; index: number }[] = []
  const seen = new Set<string>()
  for (const [name, abbr] of TEAM_NAME_TO_ABBR) {
    if (seen.has(abbr)) continue
    const idx = title.indexOf(name)
    if (idx !== -1) { found.push({ abbr, index: idx }); seen.add(abbr) }
  }
  if (found.length !== 2) return null
  found.sort((a, b) => a.index - b.index)
  const [away, home] = found
  return { awayAbbr: away.abbr, homeAbbr: home.abbr, gameKey: `${away.abbr}@${home.abbr}` }
}

// Section-name -> column mapping for the markets BDL/our automated feeds
// don't carry for FanDuel. Matched case-insensitively against each scrape's
// `sections` keys; first match wins. `market` is the bare cross-pipeline key
// shared with bdl-odds' own BDL_OPENING_MARKETS list — whichever pipeline
// (this one or BDL) sees a real price for a given (game, player, market)
// FIRST wins the permanent opening baseline, see the market_opening_prices
// write below.
const SECTION_MAP: Array<{ re: RegExp; col: string; market: string }> = [
  { re: /^to hit first home run$/i, col: 'fhr_fd', market: 'fhr' },
  // Anytime HR / 2+ HR — BDL usually carries these live for FanDuel too, so
  // the dugout merge treats these as opening-baseline-only unless BDL has no
  // value at all (see route.ts's fanduel gap merge). Matched narrowly
  // (exact, not "laser"/"moneyline parlay" etc. which also contain "home run").
  { re: /^to hit a home run$/i, col: 'sa_fd', market: 'sa' },
  { re: /^to hit 2\+ home runs$/i, col: 'hr2_fd', market: 'hr2' },
  { re: /laser.*\(?\s*110/i, col: 'laser110_fd', market: 'laser110' },
  { re: /laser.*\(?\s*105/i, col: 'laser105_fd', market: 'laser105' },
  { re: /moonshot/i, col: 'moonshot_fd', market: 'moonshot' },
  { re: /first plate appearance/i, col: 'pa1_fd', market: 'pa1' },
  { re: /home run.*moneyline parlay/i, col: 'hr_ml_fd', market: 'hrMl' },
  // Everything below is ALSO already live from BDL — same "opening baseline
  // only, never clobber a live BDL value" rule applies to these as the
  // sa_fd/hr2_fd ones above. Captured anyway so opening-vs-current deltas
  // show for every market we display, not just the true BDL gaps.
  { re: /^to hit a single$/i, col: 'sng_fd', market: 'singles' },
  { re: /^to hit a double$/i, col: 'dbl_fd', market: 'doubles' },
  { re: /^to hit a triple$/i, col: 'tri_fd', market: 'triples' },
  { re: /^to record an rbi$/i, col: 'rbi_fd', market: 'rbi' },
  { re: /^to record 2\+\s*rbis?$/i, col: 'rbi2_fd', market: 'rbi2' },
  { re: /^to record 3\+\s*rbis?$/i, col: 'rbi3_fd', market: 'rbi3' },
  // 2+/3+ total bases — same "to record N+ total bases" phrasing as 4+/5+
  // below, just never captured before now (BDL's own tb/tb3 lines just got
  // their own bucket too — see balldontlie.ts's total_bases bucketing fix).
  { re: /^to record 2\+\s*total bases$/i, col: 'tb_fd', market: 'tb' },
  { re: /^to record 3\+\s*total bases$/i, col: 'tb3_fd', market: 'tb3' },
  { re: /^to record 4\+\s*total bases$/i, col: 'tb4_fd', market: 'tb4' },
  { re: /^to record 5\+\s*total bases$/i, col: 'tb5_fd', market: 'tb5' },
  { re: /^player to record 1\+\s*hits\s*\+\s*runs\s*\+\s*rbis$/i, col: 'hrr_fd', market: 'hrr' },
]

// Combo markets are a different shape from everything else — each outcome
// pairs TWO players ("Shohei Ohtani & Max Muncy") against one shared price,
// so a player can appear in many rows. Store the cheapest price + partner
// list per player, matching mlb-party's own reasoning: MIN combo price =
// strongest book conviction that this specific player is the one to homer.
const COMBO_SECTION_MAP: Array<{ re: RegExp; minCol: string; countCol: string; partnersCol: string; market: string }> = [
  { re: /^players to combine for a home run$/i, minCol: 'combo1_min', countCol: 'combo1_count', partnersCol: 'combo1_partners', market: 'combo1Min' },
  { re: /^players to combine for 2\+ home runs$/i, minCol: 'combo2_min', countCol: 'combo2_count', partnersCol: 'combo2_partners', market: 'combo2Min' },
]

// Reverse lookup used only when building market_opening_prices rows below —
// maps each fanduel_gap_odds column name back to the bare cross-pipeline
// market key that owns it.
const COL_TO_MARKET: Record<string, string> = Object.fromEntries([
  ...SECTION_MAP.map(m => [m.col, m.market]),
  ...COMBO_SECTION_MAP.map(m => [m.minCol, m.market]),
])

// A real admin session (cookie-based) OR the same CRON_SECRET bearer token
// the /api/cron/* jobs already use — the latter lets the scrape-books
// automation call this route without ever holding a real login session/
// password for this site.
async function requireAdmin(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (cronSecret && auth === `Bearer ${cronSecret}`) return {}

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

type ScrapeOutcome = { selection: string; odds: string; parts: string[] }
type ScrapeResult = { sections: Record<string, ScrapeOutcome[]>; event?: { title?: string } }

function parseOdds(odds: string): number | null {
  if (/^even$/i.test(odds)) return 100
  const n = parseInt(odds, 10)
  return isNaN(n) ? null : n
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const body = await req.json().catch(() => null)
  const { json, gameDate, homeTeam, awayTeam, gameKey, isOpening } = body ?? {}
  if (!json || !gameDate || !homeTeam || !awayTeam) {
    return NextResponse.json({ error: 'json, gameDate, homeTeam, and awayTeam are all required — pick a game from the dropdown' }, { status: 400 })
  }

  let parsed: unknown
  try {
    parsed = typeof json === 'string' ? JSON.parse(json) : json
  } catch {
    return NextResponse.json({ error: 'That doesn\'t look like valid JSON — paste the exact console.log output from the FD scraper (a single scrape, or window.__fdAllScrapes)' }, { status: 400 })
  }

  // Accept either one scrape object (one tab) or the __fdAllScrapes array
  // (multiple tabs pasted at once) — FHR/PA1/HR-ML often live on different
  // tabs than Laser/Moonshot, so most real imports will be the array form.
  const scrapes: ScrapeResult[] = Array.isArray(parsed) ? parsed : [parsed as ScrapeResult]
  if (!scrapes.length || !scrapes.every(s => s && typeof s.sections === 'object')) {
    return NextResponse.json({ error: 'No "sections" object found — paste the exact scraper output' }, { status: 400 })
  }

  const fallbackGameKey = gameKey ?? `${awayTeam}@${homeTeam}`
  // The bare team-pair for whatever game is selected in the dropdown right
  // now — title detection below only returns a bare ABBR@ABBR pair too
  // (FanDuel's own event.title has no way to say "Game 2"), so this is what
  // a detected pair gets compared against to tell "genuinely a different
  // game" apart from "same two teams, just game 2 of a doubleheader."
  // MUST be derived from gameKey (already ABBR@ABBR[-G2]), not from the
  // full team names — comparing "PIT@CLE" against "Pittsburgh Pirates@
  // Cleveland Guardians" can never match, which silently made title
  // detection win over the passed-in gameKey on every single FD import,
  // discarding any -G2 suffix every time (invisible on a normal day, since
  // the result is the same string either way, but real corruption on a
  // doubleheader — confirmed live: today's PIT@CLE game 2 scrape landed
  // under plain "PIT@CLE", mixed in with game 1's already-finished data).
  const selectedPairKey = gameKey ? gameKey.replace(/-G\d+$/, '') : `${awayTeam}@${homeTeam}`

  // Grouped per REAL game (detected from each scrape's own event.title),
  // not per the single game selected in the dropdown — a pasted batch can
  // legitimately span multiple games' worth of tabs.
  const byGame = new Map<string, Map<string, { player_name: string; cols: Record<string, any> }>>()
  const gamesDetected = new Set<string>()
  const marketSummary: Record<string, number> = {}

  for (const scrape of scrapes) {
    const detected = detectGameFromTitle(scrape.event?.title)
    // A detected pair that matches the CURRENTLY SELECTED pair means trust
    // the dropdown (and its possible -G2 suffix) — title detection can't
    // distinguish a doubleheader's two legs since FanDuel's title is
    // identical for both. Only a detected pair for a DIFFERENT pair of
    // teams overrides the dropdown, which is the actual multi-game-paste
    // case this was built for.
    const thisGameKey = detected && detected.gameKey !== selectedPairKey ? detected.gameKey : fallbackGameKey
    gamesDetected.add(thisGameKey)
    const byPlayer = byGame.get(thisGameKey) ?? new Map()
    byGame.set(thisGameKey, byPlayer)

    const getPlayer = (rawName: string) => {
      const nn = normName(rawName)
      if (!nn) return null
      if (!byPlayer.has(nn)) byPlayer.set(nn, { player_name: rawName, cols: {} })
      return byPlayer.get(nn)!
    }

    for (const [sectionName, outcomes] of Object.entries(scrape.sections || {})) {
      const single = SECTION_MAP.find(m => m.re.test(sectionName))
      if (single) {
        let count = 0
        for (const o of outcomes) {
          // "Home Run / Moneyline Parlay" selections look like "Player Name/Team ML" —
          // take the part before the slash as the player.
          const rawName = (o.selection || '').split('/')[0].trim()
          if (!rawName || /^no home run$/i.test(rawName)) continue
          const odds = parseOdds(o.odds)
          if (odds == null) continue
          const p = getPlayer(rawName)
          if (!p) continue
          p.cols[single.col] = odds
          count++
        }
        marketSummary[single.col] = (marketSummary[single.col] ?? 0) + count
        continue
      }

      const combo = COMBO_SECTION_MAP.find(m => m.re.test(sectionName))
      if (combo) {
        // partners keyed by name_norm while we accumulate, so we can compute
        // min/count/list once per player after seeing every pairing row.
        const partnersByPlayer = new Map<string, { player_name: string; entries: { partner: string; price: number }[] }>()
        for (const o of outcomes) {
          const names = (o.selection || '').split('&').map(s => s.trim()).filter(Boolean)
          const odds = parseOdds(o.odds)
          if (names.length !== 2 || odds == null) continue
          for (let i = 0; i < 2; i++) {
            const rawName = names[i], partner = names[1 - i]
            const nn = normName(rawName)
            if (!nn) continue
            if (!partnersByPlayer.has(nn)) partnersByPlayer.set(nn, { player_name: rawName, entries: [] })
            partnersByPlayer.get(nn)!.entries.push({ partner, price: odds })
          }
        }
        let count = 0
        for (const [nn, v] of partnersByPlayer.entries()) {
          const p = getPlayer(v.player_name)
          if (!p) continue
          const min = Math.min(...v.entries.map(e => e.price))
          p.cols[combo.minCol] = min
          p.cols[combo.countCol] = v.entries.length
          p.cols[combo.partnersCol] = v.entries // real array — jsonb column, don't JSON.stringify (would double-encode)
          count++
        }
        marketSummary[combo.minCol] = (marketSummary[combo.minCol] ?? 0) + count
      }
    }
  }

  const totalPlayers = [...byGame.values()].reduce((sum, m) => sum + m.size, 0)
  if (!totalPlayers) {
    return NextResponse.json({ error: 'Parsed the JSON but found none of the target markets (FHR, Laser 105/110, Moonshot, 1st PA HR, HR/ML Parlay, Combine-for-HR) — check you pasted the right tab(s)' }, { status: 400 })
  }

  const admin = createAdminClient()
  let openingSaved = false

  for (const [thisGameKey, byPlayer] of byGame.entries()) {
    if (!byPlayer.size) continue
    const rows = Array.from(byPlayer.entries()).map(([name_norm, v]) => ({
      game_date: gameDate,
      game_key: thisGameKey,
      name_norm,
      player_name: v.player_name,
      updated_at: new Date().toISOString(),
      ...v.cols,
    }))

    const { error } = await admin
      .from('fanduel_gap_odds')
      .upsert(rows, { onConflict: 'game_date,game_key,name_norm' })
    if (error) return NextResponse.json({ error: `Upsert failed for ${thisGameKey}: ${error.message}` }, { status: 500 })

    // Preserve the FIRST real price seen for each (game, player, MARKET) as
    // a permanent opening baseline, so we can compute opening-vs-current
    // deltas. Previously this checked for ANY existing row scoped to just
    // (game_date, game_key) before writing anything — since FanDuel doesn't
    // post every market at once (FHR/PA1/HR-ML/combos often land hours after
    // the first "Opening/Early" pass), the first successful pass permanently
    // locked the whole game out of ever capturing those later markets' real
    // openers. market_opening_prices' own PK (game_date, game_key, name_norm,
    // market) + ignoreDuplicates now enforces "first wins" per market
    // instead, so every pass can safely attempt every market it captured —
    // only genuinely-new (game, player, market) combos actually insert. Also
    // the unification point with bdl-odds' own opening writes: whichever
    // pipeline sees a real price for a given key first keeps it permanently.
    if (isOpening) {
      const openingRows: { game_date: string; game_key: string; name_norm: string; market: string; book: string; opening_price: number; opening_source: 'fanduel' }[] = []
      for (const [name_norm, v] of byPlayer.entries()) {
        for (const [col, market] of Object.entries(COL_TO_MARKET)) {
          const price = v.cols[col]
          if (typeof price === 'number') {
            openingRows.push({ game_date: gameDate, game_key: thisGameKey, name_norm, market, book: 'fanduel', opening_price: price, opening_source: 'fanduel' })
          }
        }
      }
      if (openingRows.length) {
        const { error: openErr } = await admin
          .from('market_opening_prices')
          .upsert(openingRows, { onConflict: 'game_date,game_key,name_norm,market,book', ignoreDuplicates: true })
        if (!openErr) openingSaved = true
        else console.error(`[fanduel-import] opening-price upsert failed for ${thisGameKey}`, openErr)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    rowsImported: totalPlayers,
    marketSummary,
    openingSaved,
    wasOpeningPaste: !!isOpening,
    gamesDetected: [...gamesDetected],
  })
}
