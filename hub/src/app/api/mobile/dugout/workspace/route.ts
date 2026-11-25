import { NextResponse } from 'next/server'
import { getMlbResearchGame } from '@/lib/dugoutData'
import { HR_MECHANICS_MODEL_VERSION } from '@/lib/hrMechanics'
import { readMlbPregameResearch } from '@/lib/mlbPregameResearchData'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { requireTier } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { nativeMlbResearchSelection, observedMlbMechanics } from '@/lib/nativeMlbResearch'

export const maxDuration = 30
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error
  if (gate.userId !== account.userId) return reply({ error: 'Sign in required' }, 401)
  if (!await canViewMlb(account.supabase, account.userId)) return reply({ error: 'MLB research is unavailable for this account' }, 403)
  const selection = nativeMlbResearchSelection(new URL(request.url).searchParams)
  if (!selection) return reply({ error: 'Choose a valid slate, game and sample window' }, 400)

  try {
    const game = await getMlbResearchGame(selection.date, selection.game)
    if (!game) return reply({ error: 'Game not found on this slate' }, 404)
    // Reuse the frozen board's earliest known cutoff. The legacy mechanics
    // route can rebuild a missing historical window, which this read avoids.
    const board = await readMlbPregameResearch(game)
    if (!board) return reply({ mechanics: null })
    const { data, error } = await createAdminClient().from('research_mechanics_snapshots')
      .select('computed_at,payload').eq('game_date', selection.date).eq('game_pk', selection.game)
      .eq('model_version', HR_MECHANICS_MODEL_VERSION).eq('window_games', selection.window)
      .lt('computed_at', board.startAt).maybeSingle()
    if (error) throw error
    return reply({ mechanics: observedMlbMechanics(data, selection, board.startAt) })
  } catch (error) {
    console.error('[mobile/dugout/workspace]', error)
    return reply({ error: 'The pregame mechanics archive could not be loaded' }, 503)
  }
}
