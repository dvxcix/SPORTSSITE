import { NextResponse } from 'next/server'
import { getTodaysMatchups, isPregame, type TodayGame } from '@slipsurge/core/mlbSchedule'
import { requireTier } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeGameMechanics,
  HR_MECHANICS_MODEL_VERSION,
  MECHANICS_WINDOWS,
  type GameMechanicsResult,
  type MechanicsWindow,
} from '@/lib/hrMechanics'

export const revalidate = 0

function signature(game: TodayGame) {
  return [
    game.awayPitcher?.id ?? 0,
    game.homePitcher?.id ?? 0,
    Number(game.awayLineupConfirmed),
    Number(game.homeLineupConfirmed),
    ...game.awayLineup.slice(0, 9).map(player => player.mlb_id),
    ...game.homeLineup.slice(0, 9).map(player => player.mlb_id),
  ].join(':')
}

function validWindow(value: string | null): MechanicsWindow {
  const parsed = Number(value)
  return MECHANICS_WINDOWS.includes(parsed as MechanicsWindow) ? parsed as MechanicsWindow : 5
}

async function cachedResult(game: TodayGame, date: string, window: MechanicsWindow) {
  const admin = createAdminClient()
  const lineupSignature = signature(game)
  const { data } = await admin
    .from('research_mechanics_snapshots')
    .select('lineup_signature,payload,computed_at')
    .eq('game_date', date)
    .eq('game_pk', game.gamePk)
    .eq('window_games', window)
    .eq('model_version', HR_MECHANICS_MODEL_VERSION)
    .maybeSingle()
  const ageMs = data?.computed_at ? Date.now() - new Date(data.computed_at).getTime() : Number.POSITIVE_INFINITY
  const fresh = !isPregame(game.status) || ageMs < 20 * 60_000
  if (data?.payload && data.lineup_signature === lineupSignature && fresh) {
    return { result: data.payload as GameMechanicsResult, cache: 'hit' as const }
  }

  const result = await computeGameMechanics(game, date, window)
  const { error: writeError } = await admin.from('research_mechanics_snapshots').upsert({
    game_date: date,
    game_pk: game.gamePk,
    window_games: window,
    model_version: HR_MECHANICS_MODEL_VERSION,
    lineup_signature: lineupSignature,
    payload: result,
    computed_at: new Date().toISOString(),
  }, { onConflict: 'game_date,game_pk,window_games,model_version' })
  if (writeError) throw writeError
  return { result, cache: 'miss' as const }
}

export async function GET(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const gamePk = Number(searchParams.get('gamePk'))
  const window = validWindow(searchParams.get('window'))
  if (!gamePk) return NextResponse.json({ error: 'A valid gamePk is required.' }, { status: 400 })

  const games = await getTodaysMatchups(date)
  const game = games.find(candidate => candidate.gamePk === gamePk)
  if (!game) return NextResponse.json({ error: 'That game is unavailable for the selected date.' }, { status: 404 })
  if (game.awayLineup.length < 9 || game.homeLineup.length < 9) {
    return NextResponse.json({ error: 'Both nine-player lineups are required for a mechanics comparison.' }, { status: 409 })
  }

  try {
    const { result, cache } = await cachedResult(game, date, window)
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=600',
        'X-SlipSurge-Mechanics-Cache': cache,
      },
    })
  } catch (cause) {
    console.error('[research/mechanics]', cause)
    return NextResponse.json({ error: 'The mechanics model could not be prepared for this game.' }, { status: 500 })
  }
}
