import { createHash } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalizeNflPikkitMarket, normalizeNflPikkitName, resolveNflPikkitEntry, type NflPikkitIdentity, type NflPikkitMarket, type NflPikkitSnapshot } from '@/lib/nflPikkit'
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

type OddsBoardPlayer = { name?: unknown; team?: unknown; position?: unknown }

async function loadRosterIdentities(admin: ReturnType<typeof createAdminClient>, teams: string[]) {
  const rows: PlayerIdentity[] = []
  const pageSize = 1000
  for (let from = 0; from < 5000; from += pageSize) {
    const { data, error } = await admin
      .from('nfl_players')
      .select('display_name,short_name,football_name,latest_team,position')
      .in('latest_team', teams)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`NFL player identity read failed: ${error.message}`)
    const page = (data ?? []) as PlayerIdentity[]
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
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

  const [{ data: oddsRow }, identityRows] = await Promise.all([
    admin.from('nfl_odds_current').select('board').eq('game_id', game.game_id).maybeSingle(),
    loadRosterIdentities(admin, [game.away_team, game.home_team]),
  ])
  const identitiesByName = new Map<string, NflPikkitIdentity>()
  const addIdentity = (identity: NflPikkitIdentity) => {
    const key = normalizeNflPikkitName(identity.name)
    if (!key) return
    const existing = identitiesByName.get(key)
    identitiesByName.set(key, existing ? {
      ...existing,
      team: existing.team ?? identity.team,
      position: existing.position ?? identity.position,
      aliases: [...new Set([...(existing.aliases ?? []), ...(identity.aliases ?? [])])],
    } : identity)
  }
  const board = oddsRow?.board as { players?: OddsBoardPlayer[] } | null
  ;(board?.players ?? []).forEach(player => {
    if (typeof player.name !== 'string') return
    addIdentity({
      name: player.name,
      team: typeof player.team === 'string' ? player.team : null,
      position: typeof player.position === 'string' ? player.position : null,
    })
  })
  identityRows.forEach(player => {
    if (!player.display_name) return
    addIdentity({
      name: player.display_name,
      team: player.latest_team,
      position: player.position,
      aliases: [player.short_name].filter((name): name is string => Boolean(name)),
    })
  })
  const identities = [...identitiesByName.values()]

  const groupedMarkets = new Map<string, NflPikkitMarket>()
  for (const [rawKey, rawPlayers] of Object.entries(parsed.props)) {
    if (!rawPlayers || typeof rawPlayers !== 'object' || Array.isArray(rawPlayers)) continue
    const categoryLabel = parsed.marketLabels?.[rawKey] ?? rawKey
    Object.entries(rawPlayers).forEach(([rawPlayerName, picks]) => {
      if (typeof picks !== 'number' || !Number.isInteger(picks) || picks < 0 || picks > 1_000_000 || rawPlayerName.length < 2 || rawPlayerName.length > 120) return
      const resolved = resolveNflPikkitEntry(rawPlayerName, categoryLabel, identities)
      if (!resolved) return
      const propType = canonicalizeNflPikkitMarket(rawKey, resolved.marketLabel)
      const groupKey = `${rawKey}:${propType}`
      const market = groupedMarkets.get(groupKey) ?? {
        propType,
        label: resolved.marketLabel.slice(0, 120),
        rawKey: groupKey.slice(0, 120),
        rawLabel: resolved.marketLabel.slice(0, 120),
        players: [],
      }
      const playerKey = normalizeNflPikkitName(resolved.identity.name)
      const priorPlayer = market.players.find(player => player.playerKey === playerKey)
      if (!priorPlayer || picks > priorPlayer.picks) {
        if (priorPlayer) market.players.splice(market.players.indexOf(priorPlayer), 1)
        market.players.push({
          playerName: resolved.identity.name,
          playerKey,
          team: resolved.identity.team,
          position: resolved.identity.position,
          picks,
        })
      }
      groupedMarkets.set(groupKey, market)
    })
  }
  const markets = [...groupedMarkets.values()].filter(market => market.players.length)
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
