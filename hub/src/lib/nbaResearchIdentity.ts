import 'server-only'
import { createAdminClient } from './supabase/admin'
import { getPaintRoster } from './nbaPaintData'
import type { PaintGame } from './nbaPaint'

type ResearchPlayer = { player_id: number; team_id: number }

/** Fill new active identities between directory syncs without replacing stored players. */
export async function ensureNbaResearchPlayers(game: PaintGame, rows: readonly ResearchPlayer[]) {
  const teams = new Set([game.home_team.id, game.visitor_team.id])
  const wanted = new Map<number, number>()
  for (const row of rows) {
    if (!Number.isSafeInteger(row.player_id) || row.player_id <= 0 || !teams.has(row.team_id)
      || wanted.has(row.player_id) && wanted.get(row.player_id) !== row.team_id) {
      throw new Error('NBA research player identity could not be verified')
    }
    wanted.set(row.player_id, row.team_id)
  }
  if (!wanted.size) return

  const admin = createAdminClient()
  const { data, error } = await admin.from('nba_players').select('id').in('id', [...wanted.keys()])
    .abortSignal(AbortSignal.timeout(12_000))
  if (error || !data) throw new Error('NBA research player directory unavailable')
  const known = new Set(data.map(row => row.id))
  const missing = [...wanted.keys()].filter(id => !known.has(id))
  if (!missing.length) return

  // Fetch the complete canonical active roster only on a directory miss. Board
  // players contain derived/compact research fields and must not become facts.
  const roster = await getPaintRoster(game)
  const fetchedAt = new Date().toISOString()
  const identities = missing.map(id => {
    const matches = roster.filter(player => player.id === id)
    const player = matches[0]
    if (matches.length !== 1 || player.team?.id !== wanted.get(id)
      || !player.first_name?.trim() || !player.last_name?.trim()) {
      throw new Error('NBA research player identity could not be verified')
    }
    return { id: player.id, team_id: player.team.id, payload: player, fetched_at: fetchedAt }
  })
  // The normal directory collector may have inserted the player after our read.
  // Preserve that row, including any newer identity/team information.
  const { error: insertError } = await admin.from('nba_players').upsert(identities, { onConflict: 'id', ignoreDuplicates: true })
    .abortSignal(AbortSignal.timeout(12_000))
  if (insertError) throw new Error('NBA research player identities could not save')
}
