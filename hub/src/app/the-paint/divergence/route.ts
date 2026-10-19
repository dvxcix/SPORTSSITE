import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import { nbaDivergences } from '@/lib/nbaDivergence'
import type { PaintFrame } from '@/lib/nbaMovement'
import type { NbaPublicCapture } from '@/lib/nbaPublic'
import { getNbaQuoteOpenings } from '@/lib/nbaOddsHistoryData'
export const maxDuration = 60
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const game = request.nextUrl.searchParams.get('game')
  if (!game || !/^\d{1,10}$/.test(game)) return NextResponse.json({ error: 'Invalid matchup' }, { status: 400 })
  try {
    const cached = await nbaSharedCache(`divergence:v3:${game}`, 60, 300, async () => {
      const admin = createAdminClient()
      const [[first, last], openings] = await Promise.all([
        Promise.all([true, false].map(ascending => admin.from('nba_market_captures').select('captured_at,props').eq('game_id', Number(game)).order('captured_at', { ascending }).limit(1))),
        getNbaQuoteOpenings(Number(game)),
      ])
      if (first.error || last.error) throw new Error('Market snapshots unavailable')
      const frames = [...new Map([...(first.data ?? []), ...(last.data ?? [])].map(frame => [frame.captured_at, frame as PaintFrame])).values()]
      if (frames.length < 2) return { rows: [], captures: frames.length, publicCapturedAt: null, latestAt: frames[0]?.captured_at ?? null }
      const latestAt = frames.at(-1)!.captured_at
      const { data, error } = await admin.from('nba_public_captures').select('snapshot').eq('game_id', Number(game)).lte('captured_at', latestAt).order('captured_at', { ascending: false }).limit(1)
      if (error) throw new Error('Public snapshot unavailable')
      const snapshots = (data ?? []).map(row => row.snapshot as NbaPublicCapture)
      return { rows: nbaDivergences(frames, snapshots, openings), captures: frames.length, publicCapturedAt: snapshots[0]?.capturedAt ?? null, latestAt }
    })
    return NextResponse.json({ ...cached.value, fetchedAt: cached.fetchedAt, stale: cached.stale }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Cross-market research could not refresh' }, { status: 503 }) }
}
