import { nbaOddsMode } from '@/lib/nbaOddsMode'
import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import { nbaDivergences } from '@/lib/nbaDivergence'
import type { NbaPublicCapture } from '@/lib/nbaPublic'
import { getNbaAllMarketFrames, getNbaQuoteOpenings } from '@/lib/nbaOddsHistoryData'
import { getPaintGame } from '@/lib/nbaPaintData'
import { nbaGameStart } from '@/lib/nbaOddsMode'
import { nbaMilestoneSignals } from '@/lib/nbaMilestoneSignals'
export const maxDuration = 60
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const mode = nbaOddsMode(request.nextUrl.searchParams.get('mode'))
  const game = request.nextUrl.searchParams.get('game')
  if (!game || !/^\d{1,10}$/.test(game)) return NextResponse.json({ error: 'Invalid matchup' }, { status: 400 })
  try {
    const match = await getPaintGame(Number(game)), tip = nbaGameStart(match)
    const phaseKey = tip == null ? 'unverified' : `${tip}:${Date.now() >= tip ? 'closed' : 'open'}`
    const cached = await nbaSharedCache(`divergence:v7:${mode}:${game}:${phaseKey}`, 60, 0, async () => {
      const admin = createAdminClient()
      const [allFrames, openings] = await Promise.all([
        getNbaAllMarketFrames(Number(game), mode, 'edges'),
        getNbaQuoteOpenings(Number(game), mode),
      ])
      const frames = allFrames.length > 1 ? [allFrames[0], allFrames[allFrames.length - 1]] : allFrames
      if (frames.length < 2) return { rows: [], milestones:nbaMilestoneSignals(frames,openings,Number(game)), captures: frames.length, publicCapturedAt: null, latestAt: frames[0]?.captured_at ?? null }
      const latestAt = frames.at(-1)!.captured_at
      let publicQuery = admin.from('nba_public_captures').select('snapshot').eq('game_id', Number(game)).lte('captured_at', latestAt)
      if (tip != null) publicQuery = mode === 'live' ? publicQuery.gte('captured_at', new Date(tip).toISOString()) : publicQuery.lt('captured_at', new Date(tip).toISOString())
      const { data, error } = await publicQuery.order('captured_at', { ascending: false }).limit(1)
      // Public-count availability must not suppress independently verified prices.
      const snapshots = (error ? [] : data ?? []).map(row => row.snapshot as NbaPublicCapture)
      return { rows: nbaDivergences(frames, snapshots, openings),milestones:nbaMilestoneSignals(frames,openings,Number(game)), captures: frames.length, publicCapturedAt: snapshots[0]?.capturedAt ?? null, latestAt }
    })
    return NextResponse.json({ ...cached.value, mode, fetchedAt: cached.fetchedAt, stale: cached.stale }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Cross-market research could not refresh' }, { status: 503 }) }
}
