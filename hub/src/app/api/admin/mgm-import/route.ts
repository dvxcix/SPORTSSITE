import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normName } from '@/lib/nameNorm'

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

type MgmOutcome = { player_name: string; avg_hr_per_game?: string | null; odds: string | null }
type MgmScrape = { market: string; threshold: string; outcomes: MgmOutcome[] }

function parseOdds(odds: string | null): number | null {
  if (odds == null) return null
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
    return NextResponse.json({ error: 'That doesn\'t look like valid JSON — paste the exact console.log output from the BetMGM scraper (a single scrape, or window.__mgmAllScrapes)' }, { status: 400 })
  }

  // Accept either one scrape object or the __mgmAllScrapes array (1+ and 2+
  // tabs scraped separately, then pasted together).
  const scrapes: MgmScrape[] = Array.isArray(parsed) ? parsed : [parsed as MgmScrape]
  if (!scrapes.length || !scrapes.every(s => s && Array.isArray(s.outcomes))) {
    return NextResponse.json({ error: 'No "outcomes" array found — paste the exact scraper output' }, { status: 400 })
  }

  const byPlayer = new Map<string, { player_name: string; cols: Record<string, number> }>()
  const marketSummary: Record<string, number> = {}

  for (const scrape of scrapes) {
    // "1+" -> sa_mgm (anytime HR, matches sa.betmgm elsewhere in the app),
    // "2+" -> hr2_mgm. Anything else (tab text didn't resolve) is skipped
    // rather than guessed into the wrong column.
    const col = /^1\+?$/.test((scrape.threshold || '').trim()) ? 'sa_mgm'
      : /^2\+?$/.test((scrape.threshold || '').trim()) ? 'hr2_mgm'
      : null
    if (!col) continue

    let count = 0
    for (const o of scrape.outcomes) {
      const rawName = (o.player_name || '').trim()
      if (!rawName) continue
      const odds = parseOdds(o.odds)
      if (odds == null) continue
      const nn = normName(rawName)
      if (!nn) continue
      if (!byPlayer.has(nn)) byPlayer.set(nn, { player_name: rawName, cols: {} })
      byPlayer.get(nn)!.cols[col] = odds
      count++
    }
    marketSummary[col] = (marketSummary[col] ?? 0) + count
  }

  if (!byPlayer.size) {
    return NextResponse.json({ error: 'Parsed the JSON but found no usable 1+/2+ HR outcomes — check the "threshold" tab was detected (it logs as "unknown" if not) and that you scraped the "Batter home runs" section' }, { status: 400 })
  }

  const rows = Array.from(byPlayer.entries()).map(([name_norm, v]) => ({
    game_date: gameDate,
    game_key: gameKey ?? `${awayTeam}@${homeTeam}`,
    name_norm,
    player_name: v.player_name,
    updated_at: new Date().toISOString(),
    ...v.cols,
  }))

  const admin = createAdminClient()
  const { error } = await admin
    .from('mgm_gap_odds')
    .upsert(rows, { onConflict: 'game_date,game_key,name_norm' })

  if (error) return NextResponse.json({ error: `Upsert failed: ${error.message}` }, { status: 500 })

  // Preserve the FIRST "Opening/Early" paste of the day for this game —
  // never overwritten by later pastes — so we can compute deltas.
  let openingSaved = false
  if (isOpening) {
    const { data: existing } = await admin
      .from('mgm_gap_odds_opening')
      .select('name_norm')
      .eq('game_date', gameDate)
      .eq('game_key', gameKey ?? `${awayTeam}@${homeTeam}`)
      .limit(1)
    if (!existing || existing.length === 0) {
      const openingRows = rows.map(({ updated_at, ...r }) => ({ ...r, captured_at: new Date().toISOString() }))
      const { error: openErr } = await admin
        .from('mgm_gap_odds_opening')
        .upsert(openingRows, { onConflict: 'game_date,game_key,name_norm' })
      openingSaved = !openErr
    }
  }

  return NextResponse.json({ ok: true, rowsImported: rows.length, marketSummary, openingSaved, wasOpeningPaste: !!isOpening })
}
