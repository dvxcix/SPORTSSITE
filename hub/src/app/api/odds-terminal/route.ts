import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { requireTier } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFirstPitchAt } from '@/lib/mlbFirstPitch'
import { canonGameKey } from '@slipsurge/core/teamAbbr'

export const dynamic = 'force-dynamic'

const MAX_SNAPSHOTS = 2400
const PAGE_SIZE = 1000

type PriceBook = Record<string, number | string>
type PropEntry = { name?: string; [market: string]: string | PriceBook | undefined }
type SnapshotRow = { captured_at: string; prop_map: Record<string, PropEntry> | null }
type GapRow = { name_norm: string; player_name: string | null; updated_at: string; [column: string]: string | number | null }

const FANDUEL_GAP_MARKETS: Record<string, string> = {
  fhr_fd: 'fhr', sa_fd: 'sa', hr2_fd: 'hr2', sng_fd: 'singles', dbl_fd: 'doubles', tri_fd: 'triples',
  rbi_fd: 'rbi', rbi2_fd: 'rbi2', rbi3_fd: 'rbi3', tb_fd: 'tb', tb3_fd: 'tb3', tb4_fd: 'tb4',
  tb5_fd: 'tb5', hrr_fd: 'hrr', laser105_fd: 'laser105', laser110_fd: 'laser110', moonshot_fd: 'moonshot',
  pa1_fd: 'pa1', hr_ml_fd: 'hrMl',
}

function buildFanDuelMap(rows: Array<GapRow | { name_norm: string; market: string; opening_price: number }>) {
  const propMap: Record<string, PropEntry> = {}
  for (const row of rows) {
    if (row.name_norm === '__game__') continue
    const key = row.name_norm
    const entry = propMap[key] ??= { name: 'player_name' in row && row.player_name ? row.player_name : key }
    if ('market' in row && typeof row.market === 'string' && typeof row.opening_price === 'number') {
      entry[row.market] = { fanduel: row.opening_price }
      continue
    }
    const gap = row as GapRow
    for (const [column, market] of Object.entries(FANDUEL_GAP_MARKETS)) {
      const price = gap[column]
      if (typeof price === 'number') entry[market] = { fanduel: price }
    }
  }
  return propMap
}

function compactSnapshots(rows: SnapshotRow[]) {
  const previous = new Map<string, number | string>()

  return rows.flatMap(row => {
    const propMap: Record<string, PropEntry> = {}
    for (const [playerKey, rawEntry] of Object.entries(row.prop_map ?? {})) {
      if (!rawEntry || typeof rawEntry !== 'object') continue
      const entry: PropEntry = { name: typeof rawEntry.name === 'string' ? rawEntry.name : playerKey }
      let changed = false

      for (const [market, rawBooks] of Object.entries(rawEntry)) {
        if (market === 'name' || !rawBooks || typeof rawBooks !== 'object' || Array.isArray(rawBooks)) continue
        const books: PriceBook = {}
        for (const [book, rawPrice] of Object.entries(rawBooks)) {
          if (typeof rawPrice !== 'number' && typeof rawPrice !== 'string') continue
          const key = `${playerKey}\u001f${market}\u001f${book}`
          if (previous.get(key) === rawPrice) continue
          previous.set(key, rawPrice)
          books[book] = rawPrice
          changed = true
        }
        if (Object.keys(books).length) entry[market] = books
      }

      if (changed) propMap[playerKey] = entry
    }

    return Object.keys(propMap).length ? [{ captured_at: row.captured_at, prop_map: propMap }] : []
  })
}

async function readHistory(date: string, gamePk: string, requestedGameKey?: string) {
  const admin = createAdminClient()
  const rows: SnapshotRow[] = []

  // gamePk is the stable identifier. Derive gameKey from our persisted
  // snapshot so started/final games and clients cached during a deployment
  // never fail merely because the presentation payload omitted gameKey.
  const { data: gameMeta, error: gameMetaError } = await admin
    .from('pregame_odds_snapshots')
    .select('home_abbr,away_abbr')
    .eq('game_pk', gamePk)
    .maybeSingle()
  if (gameMetaError) throw gameMetaError
  const derivedGameKey = gameMeta?.away_abbr && gameMeta?.home_abbr
    ? canonGameKey(`${gameMeta.away_abbr}@${gameMeta.home_abbr}`)
    : null
  const gameKey = requestedGameKey ?? derivedGameKey
  if (!gameKey) throw new Error(`Could not resolve game key for ${gamePk}`)

  const firstPitchAt = await getFirstPitchAt(gamePk)

  // PostgREST caps a response at 1,000 rows in this project. Busy pregame
  // histories exceed that, so every capture must be read in ordered pages.
  for (let from = 0; from < MAX_SNAPSHOTS; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, MAX_SNAPSHOTS - 1)
    const { data, error } = await admin
      .from('pregame_odds_snapshot_history')
      .select('captured_at,prop_map')
      .eq('game_date', date)
      .eq('game_pk', gamePk)
      .order('captured_at', { ascending: true })
      .range(from, to)

    if (error) throw error
    const page = (data ?? []) as SnapshotRow[]
    rows.push(...(firstPitchAt ? page.filter(row => row.captured_at <= firstPitchAt) : page))
    if (page.length < PAGE_SIZE) break
  }

  // Browserbase imports FanDuel-only markets (FHR, Laser, Moonshot, PA1,
  // HR/ML) into the gap table, not BDL's generic snapshot history. Overlay
  // the permanent opener and latest imported board so the terminal exposes
  // the same FanDuel data as The Dugout without pretending intermediate
  // movement captures exist.
  const [{ data: gapRows, error: gapError }, { data: openingRows, error: openingError }] = await Promise.all([
    admin.from('fanduel_gap_odds')
      .select(`game_key,name_norm,player_name,updated_at,${Object.keys(FANDUEL_GAP_MARKETS).join(',')}`)
      .eq('game_date', date).eq('game_key', gameKey).range(0, 19999),
    admin.from('market_opening_prices')
      .select('name_norm,market,opening_price,captured_at')
      .eq('game_date', date).eq('game_key', gameKey).eq('book', 'fanduel').range(0, 19999),
  ])
  if (gapError) throw gapError
  if (openingError) throw openingError

  const openers = (openingRows ?? []) as Array<{ name_norm: string; market: string; opening_price: number; captured_at: string }>
  const openerMap = buildFanDuelMap(openers)
  if (Object.keys(openerMap).length) {
    const openingCapture = openers.reduce((earliest, row) => row.captured_at < earliest ? row.captured_at : earliest, openers[0].captured_at)
    rows.push({ captured_at: openingCapture, prop_map: openerMap })
  }

  const gaps = ((gapRows ?? []) as unknown as GapRow[]).filter(row => !firstPitchAt || row.updated_at <= firstPitchAt)
  if (gaps.length) {
    const latestImport = gaps.reduce((latest, row) => row.updated_at > latest ? row.updated_at : latest, gaps[0].updated_at)
    rows.push({ captured_at: latestImport, prop_map: buildFanDuelMap(gaps) })
  }
  rows.sort((a, b) => a.captured_at.localeCompare(b.captured_at))

  return { sourceCount: rows.length, snapshots: compactSnapshots(rows) }
}

const readLiveHistory = unstable_cache(readHistory, ['odds-terminal-history-live-v4'], { revalidate: 20 })
const readArchivedHistory = unstable_cache(readHistory, ['odds-terminal-history-archive-v4'], { revalidate: 86400 })

export async function GET(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const gamePk = searchParams.get('gamePk')?.trim()
  const gameKey = searchParams.get('gameKey')?.trim().toUpperCase()
  const date = searchParams.get('date')?.trim()
  if (!gamePk || !/^\d+$/.test(gamePk) || (gameKey && !/^[A-Z0-9]+@[A-Z0-9]+(?:-G\d+)?$/.test(gameKey)) || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A valid date and gamePk are required.' }, { status: 400 })
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  try {
    const history = date === today ? await readLiveHistory(date, gamePk, gameKey) : await readArchivedHistory(date, gamePk, gameKey)
    return NextResponse.json(
      { date, gamePk, snapshots: history.snapshots, sourceCount: history.sourceCount },
      { headers: { 'Cache-Control': date === today ? 'private, max-age=20' : 'private, max-age=86400, immutable' } },
    )
  } catch (error) {
    console.error('[odds-terminal] history read failed', { date, gamePk, error })
    return NextResponse.json({ error: 'Odds history is temporarily unavailable.' }, { status: 500 })
  }
}
