import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { requireTier } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const MAX_SNAPSHOTS = 2400
const PAGE_SIZE = 1000

type PriceBook = Record<string, number | string>
type PropEntry = { name?: string; [market: string]: string | PriceBook | undefined }
type SnapshotRow = { captured_at: string; prop_map: Record<string, PropEntry> | null }

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

async function readHistory(date: string, gamePk: string) {
  const admin = createAdminClient()
  const rows: SnapshotRow[] = []

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
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return { sourceCount: rows.length, snapshots: compactSnapshots(rows) }
}

const readLiveHistory = unstable_cache(readHistory, ['odds-terminal-history-live-v2'], { revalidate: 20 })
const readArchivedHistory = unstable_cache(readHistory, ['odds-terminal-history-archive-v2'], { revalidate: 86400 })

export async function GET(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const gamePk = searchParams.get('gamePk')?.trim()
  const date = searchParams.get('date')?.trim()
  if (!gamePk || !/^\d+$/.test(gamePk) || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A valid date and gamePk are required.' }, { status: 400 })
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  try {
    const history = date === today ? await readLiveHistory(date, gamePk) : await readArchivedHistory(date, gamePk)
    return NextResponse.json(
      { date, gamePk, snapshots: history.snapshots, sourceCount: history.sourceCount },
      { headers: { 'Cache-Control': date === today ? 'private, max-age=20' : 'private, max-age=86400, immutable' } },
    )
  } catch (error) {
    console.error('[odds-terminal] history read failed', { date, gamePk, error })
    return NextResponse.json({ error: 'Odds history is temporarily unavailable.' }, { status: 500 })
  }
}
