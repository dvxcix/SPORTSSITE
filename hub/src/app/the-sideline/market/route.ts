import { NextResponse } from 'next/server'
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
    if (params.get('index') === '1') {
      return NextResponse.json({ timeline: await getSidelineTimeline(id) }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    const { games } = await getSidelineGames(undefined, id)
    const game = games.find(item => item.id === id)
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (at) {
      const frame = await getSidelineCapture(game, new Date(at).toISOString())
      return NextResponse.json({ frame }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    return NextResponse.json(await getSidelineOddsBundle(game), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[the-sideline] market request failed', error)
    return NextResponse.json({ error: 'Market data temporarily unavailable. Retry shortly.' }, { status: 503 })
  }
}
