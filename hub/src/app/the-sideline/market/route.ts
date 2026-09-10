import { NextResponse } from 'next/server'
import { packSidelineBoard } from '@/lib/sidelineWire'
import { createClient } from '@/lib/supabase/server'
import { getSidelineCapture, getSidelineGames, getSidelineOddsBundle, getSidelineTimeline } from '../data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle()
  if (profile?.account_type !== 'admin') return NextResponse.json({ error: 'Admin preview only' }, { status: 403 })
  const params = new URL(request.url).searchParams
  const id = params.get('game') ?? ''
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Invalid game' }, { status: 400 })
  const at = params.get('at')
  if (at && !Number.isFinite(Date.parse(at))) return NextResponse.json({ error: 'Invalid capture' }, { status: 400 })
  try {
    const { games } = await getSidelineGames(undefined, id)
    const game = games.find(item => item.id === id)
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (params.get('index') === '1') {
      return NextResponse.json({ timeline: await getSidelineTimeline(game) }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    if (at) {
      const frame = await getSidelineCapture(game, new Date(at).toISOString())
      return NextResponse.json({ frame: frame && params.get('packed')==='1' ? {...frame,board:packSidelineBoard(frame.board)} : frame }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    // Current-board polling also needs the slider index. Returning both in
    // one authenticated response avoids a second Function invocation every
    // 30 seconds for every open Sideline tab.
    const [bundle, timeline] = await Promise.all([
      getSidelineOddsBundle(game),
      getSidelineTimeline(game),
    ])
    return NextResponse.json(
      params.get('packed') === '1'
        ? { odds: packSidelineBoard(bundle.odds), gameState: bundle.gameState, timeline }
        : { ...bundle, timeline },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    console.error('[the-sideline] market request failed', error)
    return NextResponse.json({ error: 'Market data temporarily unavailable. Retry shortly.' }, { status: 503 })
  }
}
