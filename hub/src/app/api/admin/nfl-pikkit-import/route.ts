import { createHash } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalizeNflPikkitMarket, normalizeNflPikkitName, type NflPikkitMarket, type NflPikkitSnapshot } from '@/lib/nflPikkit'
import type { PikkitScrapePayload } from '@/lib/scrapers/pikkitScraper'

export const revalidate = 0
export const maxDuration = 60

async function requireAdmin(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`) return null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle()
  return profile?.account_type === 'admin' ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

type PlayerIdentity = {
  display_name: string | null
  short_name: string | null
  football_name: string | null
  latest_team: string | null
  position: string | null
}

export async function POST(req: Request) {
  const authError = await requireAdmin(req)
  if (authError) return authError
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > 8_000_000) return NextResponse.json({ error: 'Import payload is too large' }, { status: 413 })
  const body = await req.json().catch(() => null) as { json?: PikkitScrapePayload | string; gameId?: string } | null
  if (!body?.json || typeof body.gameId !== 'string') return NextResponse.json({ error: 'json and gameId are required' }, { status: 400 })

  let parsed: PikkitScrapePayload
  try { parsed = typeof body.json === 'string' ? JSON.parse(body.json) : body.json } catch { return NextResponse.json({ error: 'Invalid Pikkit JSON' }, { status: 400 }) }
  if (!parsed?.props || typeof parsed.props !== 'object') return NextResponse.json({ error: 'No props object found' }, { status: 400 })

  const admin = createAdminClient()
  const { data: game, error: gameError } = await admin
    .from('nfl_schedule')
    .select('game_id,season,week,gameday,away_team,home_team')
    .eq('game_id', body.gameId)
    .maybeSingle()
  if (gameError || !game) return NextResponse.json({ error: 'NFL game not found' }, { status: 404 })

  const { data: identityRows } = await admin
    .from('nfl_players')
    .select('display_name,short_name,football_name,latest_team,position')
    .in('latest_team', [game.away_team, game.home_team])
    .limit(500)
  const identities = new Map<string, PlayerIdentity>()
  ;((identityRows ?? []) as PlayerIdentity[]).forEach(player => {
    ;[player.display_name, player.short_name, player.football_name].forEach(name => {
      if (name) identities.set(normalizeNflPikkitName(name), player)
    })
  })

  const markets: NflPikkitMarket[] = []
  for (const [rawKey, rawPlayers] of Object.entries(parsed.props)) {
    if (!rawPlayers || typeof rawPlayers !== 'object' || Array.isArray(rawPlayers)) continue
    const rawLabel = parsed.marketLabels?.[rawKey] ?? rawKey
    const propType = canonicalizeNflPikkitMarket(rawKey, rawLabel)
    const players = Object.entries(rawPlayers).flatMap(([playerName, picks]) => {
      if (typeof picks !== 'number' || !Number.isInteger(picks) || picks < 0 || picks > 1_000_000 || playerName.length < 2 || playerName.length > 120) return []
      const playerKey = normalizeNflPikkitName(playerName)
      const identity = identities.get(playerKey)
      return [{ playerName, playerKey, team: identity?.latest_team ?? null, position: identity?.position ?? null, picks }]
    })
    if (players.length) markets.push({ propType, label: rawLabel.slice(0, 120), rawKey: rawKey.slice(0, 120), rawLabel: rawLabel.slice(0, 120), players })
  }
  if (!markets.length) return NextResponse.json({ error: 'No valid NFL public picks found' }, { status: 400 })

  const capturedAt = Number.isFinite(Date.parse(parsed.capturedAt)) ? parsed.capturedAt : new Date().toISOString()
  const sourceUrl = /^https:\/\/app\.pikkit\.com\//i.test(parsed.url ?? '') ? parsed.url : null
  const snapshot: NflPikkitSnapshot = {
    gameId: game.game_id,
    gameDate: game.gameday,
    season: game.season,
    week: game.week,
    awayTeam: game.away_team,
    homeTeam: game.home_team,
    capturedAt,
    sourceUrl,
    markets,
  }
  const payloadHash = createHash('sha256').update(JSON.stringify(markets)).digest('hex')
  const { data: prior, error: priorError } = await admin.from('nfl_pikkit_picks_current').select('payload_hash').eq('game_id', game.game_id).maybeSingle()
  if (priorError && priorError.code !== '42P01') throw new Error(`NFL Pikkit current read failed: ${priorError.message}`)
  const row = {
    game_id: game.game_id,
    game_date: game.gameday,
    season: game.season,
    week: game.week,
    away_abbr: game.away_team,
    home_abbr: game.home_team,
    snapshot,
    payload_hash: payloadHash,
    captured_at: capturedAt,
  }
  const { error: upsertError } = await admin.from('nfl_pikkit_picks_current').upsert(row, { onConflict: 'game_id' })
  if (upsertError) throw new Error(`NFL Pikkit current write failed: ${upsertError.message}`)
  const changed = prior?.payload_hash !== payloadHash
  if (changed) {
    const { error: historyError } = await admin.from('nfl_pikkit_picks_snapshot_history').upsert(row, { onConflict: 'game_id,payload_hash', ignoreDuplicates: true })
    if (historyError) throw new Error(`NFL Pikkit history write failed: ${historyError.message}`)
  }
  revalidateTag('sideline:nfl-picks', 'max')
  return NextResponse.json({ ok: true, gameId: game.game_id, markets: markets.length, players: markets.reduce((sum, market) => sum + market.players.length, 0), changed, capturedAt })
}
