import { NextResponse } from 'next/server'
import { pitchColor, pitchLabel } from '@slipsurge/core/mlb-api'
import { GET as loadPitcherWindow } from '@/app/api/pitcher-report/live-window/route'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import type { AggPitchRow } from '@slipsurge/core/pitchLog'

export const revalidate = 0
export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store' }
const positiveID = (value: string) => /^\d{1,10}$/.test(value) && Number(value) > 0

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  if (!await canViewMlb(account.supabase, account.userId)) {
    return NextResponse.json({ error: 'MLB research is unavailable for this account' }, { status: 403, headers })
  }
  const url = new URL(request.url)
  const date = url.searchParams.get('date') ?? ''
  const gamePk = url.searchParams.get('gamePk') ?? ''
  const pitcherId = url.searchParams.get('pitcherId') ?? ''
  const games = url.searchParams.get('games') ?? '3'
  const day = new Date(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== date ||
      !positiveID(gamePk) || !positiveID(pitcherId) || !['3', '5', '10'].includes(games) || url.searchParams.has('mode')) {
    return NextResponse.json({ error: 'Choose a valid date, matchup and pitcher window' }, { status: 400, headers })
  }
  url.search = new URLSearchParams({ date, gamePk, pitcherId, games, mode: 'pregame' }).toString()
  const response = await loadPitcherWindow(new Request(url, { headers: request.headers }))
  if (!response.ok) return response
  const body = await response.json() as { pitcherRows: Record<'R' | 'L', AggPitchRow[]> }
  const type = (row: AggPitchRow) => ({ ...row, label: pitchLabel(row.pitch_type), color: pitchColor(row.pitch_type) })
  return NextResponse.json({ ...body, pitcherRows: { R: body.pitcherRows.R.map(type), L: body.pitcherRows.L.map(type) } }, { headers })
}
