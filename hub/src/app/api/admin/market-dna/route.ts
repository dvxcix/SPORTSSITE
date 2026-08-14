import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeMarketDna, analyzeMarketDnaGame, analyzeMarketDnaSlate, buildMarketDnaSlate } from '@/lib/marketDna'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  return profile?.account_type === 'admin' ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET(request: Request) {
  const authError = await requireAdmin()
  if (authError) return authError
  const date = new URL(request.url).searchParams.get('date') ?? ''
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'Pass a valid YYYY-MM-DD date.' }, { status: 400 })
  try {
    return NextResponse.json(await buildMarketDnaSlate(date))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not reconstruct the market board.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authError = await requireAdmin()
  if (authError) return authError
  const body = await request.json().catch(() => null)
  const date = typeof body?.date === 'string' ? body.date : ''
  const gamePk = Number(body?.gamePk)
  const mlbId = Number(body?.mlbId)
  const mode = body?.mode === 'slate' ? 'slate' : body?.mode === 'game' ? 'game' : 'player'
  if (!DATE_RE.test(date) || (mode !== 'slate' && !Number.isFinite(gamePk)) || (mode === 'player' && !Number.isFinite(mlbId))) {
    return NextResponse.json({ error: mode === 'slate' ? 'A valid date is required.' : mode === 'game' ? 'A valid date and game are required.' : 'A valid date, game and player are required.' }, { status: 400 })
  }
  try {
    const slate = await buildMarketDnaSlate(date)
    if (mode === 'slate') return NextResponse.json(await analyzeMarketDnaSlate(date, slate.games))
    const game = slate.games.find(candidate => candidate.gamePk === gamePk)
    if (!game) return NextResponse.json({ error: 'That game is not present on the captured slate.' }, { status: 404 })
    if (mode === 'game') return NextResponse.json(await analyzeMarketDnaGame(game))
    const player = game.players.find(candidate => candidate.mlbId === mlbId)
    if (!player) return NextResponse.json({ error: 'That player is not present on the captured 18-player board.' }, { status: 404 })
    return NextResponse.json(await analyzeMarketDna(player))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not match the historical profile.' }, { status: 500 })
  }
}
