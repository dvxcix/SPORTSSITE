import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MP_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
// Was hardcoded here (and in api/dugout/data/route.ts) — a live service_role
// key with full DB access baked straight into committed source is a real
// exposure risk the moment this repo is anywhere a wider audience can read
// it. Read from env instead; see .env.local for the value.
const MP_KEY = process.env.MLB_PARTY_SERVICE_ROLE_KEY!
const mpH = { apikey: MP_KEY, Authorization: `Bearer ${MP_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }

// Maps the short keys the Pikkit bookmarklet groups results under to the
// long market names pikkit_public_picks.market already uses historically.
const MARKET_MAP: Record<string, string> = {
  hr: 'home_runs',
  tb: 'bases',
  hrr: 'hits_runs_rbi',
  singles: 'singles',
  doubles: 'doubles',
  hits: 'hits',
  rbi: 'rbi',
  triples: 'triples',
  runs: 'runs',
  stolen_bases: 'stolen_bases',
  walks: 'walks',
  strikeouts: 'strikouts', // matches the existing (typo'd) historical value
}

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

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  const body = await req.json().catch(() => null)
  const { json, gameDate, homeTeam, awayTeam, gameKey } = body ?? {}
  if (!json || !gameDate || !homeTeam || !awayTeam) {
    return NextResponse.json({ error: 'json, gameDate, homeTeam, and awayTeam are all required — pick a game from the dropdown' }, { status: 400 })
  }

  let parsed: { url?: string; game?: string; props: Record<string, Record<string, number>> }
  try {
    parsed = typeof json === 'string' ? JSON.parse(json) : json
  } catch {
    return NextResponse.json({ error: 'That doesn\'t look like valid JSON — paste the exact console.log output from the bookmarklet' }, { status: 400 })
  }
  if (!parsed?.props || typeof parsed.props !== 'object') {
    return NextResponse.json({ error: 'No "props" object found in the pasted JSON' }, { status: 400 })
  }

  // pikkit_public_picks' primary key now includes game_key (widened via a
  // backward-compatible migration — a bare player_name+game_date+market row
  // used to be the whole key, which meant the second leg of a doubleheader
  // silently overwrote the first game's picks for any player common to
  // both). The game picker already resolves the exact per-leg key
  // ("TB@BOS" / "TB@BOS-G2") the same way Dugout's own game tabs do —
  // stamp every row with it so the two legs get separate storage slots.
  const rows: any[] = []
  const marketSummary: Record<string, number> = {}
  for (const [shortKey, players] of Object.entries(parsed.props)) {
    const market = MARKET_MAP[shortKey] ?? shortKey
    let count = 0
    for (const [playerName, picks] of Object.entries(players)) {
      if (typeof picks !== 'number') continue
      rows.push({
        player_name: playerName,
        game_date: gameDate,
        market,
        prop_type: market,
        picks,
        pick_count: picks, // NOT NULL column, kept in sync with `picks`
        home_team: homeTeam,
        away_team: awayTeam,
        game_key: gameKey ?? '',
        updated_at: new Date().toISOString(),
      })
      count++
    }
    marketSummary[market] = count
  }

  if (!rows.length) {
    return NextResponse.json({ error: 'Parsed the JSON but found zero player picks inside it' }, { status: 400 })
  }

  const res = await fetch(`${MP_URL}/rest/v1/pikkit_public_picks?on_conflict=player_name,game_date,market,game_key`, {
    method: 'POST',
    headers: mpH,
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return NextResponse.json({ error: `Upsert failed: ${res.status} ${errText}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, rowsImported: rows.length, marketSummary, gameKey: gameKey ?? null })
}
